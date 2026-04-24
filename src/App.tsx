/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  User as FirebaseUser 
} from 'firebase/auth';
import { collection, doc, getDoc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';

import { 
  BookOpen, 
  Calendar as CalendarIcon, 
  Globe, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Clock,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  TrendingUp,
  Target,
  BrainCircuit,
  ChevronRight,
  BarChart3,
  Upload,
  Search,
  Bell,
  User,
  Users,
  Activity,
  MessageSquare,
  Library,
  Plus,
  ChevronLeft,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Info,
  Menu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from "recharts";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, eachDayOfInterval } from "date-fns";
import { jsPDF } from "jspdf";
import { cn } from "@/src/lib/utils";

import * as pdfjs from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// --- Types ---

interface FileData {
  name: string;
  content: string;
  type: "syllabus" | "calendar" | "standards" | "grading" | "pretest";
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: "class" | "study" | "activity";
  description?: string;
}

interface ScoreRecord {
  id: string;
  subject: string;
  assessment: string;
  score: number;
  maxScore: number;
  date: string;
}

interface PerformanceData {
  weakTopics: string[];
  strongTopics: string[];
  improvementScore: number;
  history: { date: string; score: number }[];
  scores: ScoreRecord[];
}

interface Question {
  id: string;
  text: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
}

interface Activity {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

interface QuizResult {
  id: string;
  activityTitle: string;
  score: number;
  total: number;
  date: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
  type: "info" | "success" | "warning";
}

// --- Types & Interfaces ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const LoginView = ({ onLoginSuccess, onAdminLogin }: { onLoginSuccess: () => void, onAdminLogin: (role: "teacher" | "mis") => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activePortal, setActivePortal] = useState<"student" | "admin" | null>(null);
  const [adminMode, setAdminMode] = useState<"teacher" | "mis" | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isRegistering && password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: `${firstName} ${lastName}` });
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          role: "student",
          createdAt: new Date().toISOString()
        });
      } else {
        // Special case for the requested Student test account
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (signInErr: any) {
          if (email === "paulino134@gmail.com" && (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential')) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: "diane paulino" });
            await setDoc(doc(db, "users", user.uid), {
              uid: user.uid,
              email: user.email,
              firstName: "diane",
              lastName: "paulino",
              displayName: "diane paulino",
              role: "student",
              createdAt: new Date().toISOString()
            });
          } else {
            throw signInErr;
          }
        }
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminMode) return;
    setLoading(true);
    setError(null);

    try {
      // Special case for the requested MIS Admin account
      // We try to sign in first.
      let user;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
        user = userCredential.user;
      } catch (signInErr: any) {
        // If sign in fails and it's our special account, try to create it if it doesn't exist
        const isSpecialAccount = adminEmail === "MIStest373@gmail.com" || adminEmail === "estherreyes012@gmail.com";
        const isUserNotFound = signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/user-disabled';
        
        if (isSpecialAccount && isUserNotFound) {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            user = userCredential.user;
            const displayName = adminEmail === "MIStest373@gmail.com" ? "John Santos" : "Ms. Esther Reyes";
            await updateProfile(user, { displayName });
          } catch (createErr: any) {
            // If creation fails because it exists, then the password was probably just wrong
            if (createErr.code === 'auth/email-already-in-use') {
              throw signInErr;
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }

      if (!user) throw new Error("Authentication failed");
      
      // Fetch or create profile
      const docSnap = await getDoc(doc(db, "users", user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Proactively update special accounts if names are wrong
        if (adminEmail === "MIStest373@gmail.com" && (data.displayName !== "John Santos" || data.position !== "head MIS admin")) {
          await updateDoc(doc(db, "users", user.uid), {
            displayName: "John Santos",
            position: "head MIS admin"
          });
        }
        
        // If the user is trying to log into the "wrong" portal type but has a valid admin role, we'll let them through but update the mode.
        if (data.role === adminMode || (data.role === 'mis' && adminMode === 'teacher') || (data.role === 'teacher' && adminMode === 'mis')) {
          const actualRole = data.role;
          onAdminLogin(actualRole);
        } else {
          setError(`Account is registered as ${data.role}, not ${adminMode}.`);
          await signOut(auth);
        }
      } else {
        // If user exists in Auth but not in Firestore, create the profile
        let role = "teacher";
        if (adminEmail === "MIStest373@gmail.com" || adminEmail === "dianegrace.0103@gmail.com") {
          role = "mis";
        } else if (adminEmail === "estherreyes012@gmail.com") {
          role = "teacher";
        }
        
        const displayName = adminEmail === "MIStest373@gmail.com" ? "John Santos" : (adminEmail === "estherreyes012@gmail.com" ? "Ms. Esther Reyes" : user.displayName || "Admin");
        
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: displayName,
          position: adminEmail === "MIStest373@gmail.com" ? "head MIS admin" : undefined,
          role: role,
          createdAt: new Date().toISOString()
        });
        onAdminLogin(role as any);
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className={cn(
        "max-w-6xl w-full grid gap-8 transition-all duration-500",
        activePortal ? "grid-cols-1 max-w-md" : "grid-cols-1 lg:grid-cols-2"
      )}>
        {/* Student Login Container */}
        {(activePortal === null || activePortal === "student") && (
          <motion.div 
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-[40px] p-10 shadow-2xl border border-slate-100 flex flex-col"
          >
            {activePortal === null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-12">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600">
                  <BrainCircuit size={40} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Student Login</h2>
                  <p className="text-slate-500 text-sm mt-2">Access your AI-powered study companion</p>
                </div>
                <button 
                  onClick={() => setActivePortal("student")}
                  className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-2"
                >
                  Enter Student Portal
                  <ChevronRight size={20} />
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-10">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-indigo-100">
                    <BrainCircuit size={32} />
                  </div>
                  <h1 className="text-2xl font-black text-slate-900">Student Login</h1>
                  <p className="text-slate-500 text-sm mt-2">Access your AI-powered study companion</p>
                </div>

                <form onSubmit={handleStudentSubmit} className="space-y-4 flex-1">
                  {isRegistering && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                        <input 
                          type="text" 
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Jane"
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                        <input 
                          type="text" 
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Doe"
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Email</label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@university.edu"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  {isRegistering && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                      <div className="relative">
                        <input 
                          type={showConfirmPassword ? "text" : "password"} 
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {activePortal === "student" && error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-xs font-bold">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading && activePortal === "student" ? <Loader2 size={20} className="animate-spin" /> : isRegistering ? "Create Account" : "Sign In"}
                    {!loading && <ChevronRight size={20} />}
                  </button>
                </form>

                <div className="mt-8 text-center space-y-4">
                  <button 
                    onClick={() => {
                      setIsRegistering(!isRegistering);
                      setError(null);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors block w-full"
                  >
                    {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Create one"}
                  </button>
                  <button 
                    onClick={() => {
                      setActivePortal(null);
                      setError(null);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Back to Selection
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Admin Login Container */}
        {(activePortal === null || activePortal === "admin") && (
          <motion.div 
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white rounded-[40px] p-10 shadow-2xl border border-slate-100 flex flex-col"
          >
            {activePortal === null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-12">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400">
                  <User size={40} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Admin Login</h2>
                  <p className="text-slate-500 text-sm mt-2">Faculty and MIS administration access</p>
                </div>
                <button 
                  onClick={() => setActivePortal("admin")}
                  className="px-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-100 flex items-center gap-2"
                >
                  Enter Admin Portal
                  <ChevronRight size={20} />
                </button>
              </div>
            ) : adminMode === null ? (
              <div className="flex-1 flex flex-col">
                <div className="text-center mb-10">
                  <h2 className="text-2xl font-black text-slate-900">Select Portal</h2>
                  <p className="text-slate-500 text-sm mt-2">Choose your administrative role</p>
                </div>
                <div className="grid grid-cols-1 gap-4 flex-1">
                  <button 
                    onClick={() => setAdminMode("teacher")}
                    className="group p-8 bg-slate-50 border border-slate-100 rounded-[32px] hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left flex items-center gap-6"
                  >
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm transition-colors">
                      <GraduationCap size={28} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900">Teacher Portal</h3>
                      <p className="text-xs text-slate-500 mt-1">Manage courses and students</p>
                    </div>
                  </button>
                  <button 
                    onClick={() => setAdminMode("mis")}
                    className="group p-8 bg-slate-50 border border-slate-100 rounded-[32px] hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left flex items-center gap-6"
                  >
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm transition-colors">
                      <Globe size={28} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900">MIS Portal</h3>
                      <p className="text-xs text-slate-500 mt-1">System administration and IT</p>
                    </div>
                  </button>
                </div>
                <button 
                  onClick={() => setActivePortal(null)}
                  className="mt-6 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Back to Selection
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="text-center mb-10">
                  <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-slate-100">
                    {adminMode === "teacher" ? <GraduationCap size={32} /> : <Globe size={32} />}
                  </div>
                  <h2 className="text-2xl font-black text-slate-900">
                    {adminMode === "teacher" ? "Teacher Login" : "MIS Login"}
                  </h2>
                  <p className="text-slate-500 text-sm mt-2">Enter your administrative credentials</p>
                </div>

                <form onSubmit={handleAdminSubmit} className="space-y-4 flex-1">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
                    <input 
                      type="email" 
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@university.edu"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                    <div className="relative">
                      <input 
                        type={showAdminPassword ? "text" : "password"} 
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showAdminPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  {activePortal === "admin" && error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-xs font-bold">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-100 hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading && activePortal === "admin" ? <Loader2 size={20} className="animate-spin" /> : "Sign In to Portal"}
                    {!loading && <ChevronRight size={20} />}
                  </button>
                </form>

                <button 
                  onClick={() => {
                    setAdminMode(null);
                    setError(null);
                  }}
                  className="mt-6 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Back to Role Selection
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

const MiniCalendar = ({ date }: { date: Date }) => {
  const [viewDate, setViewDate] = useState(date);

  // Sync with prop only when month/year changes or if we want it to follow the clock initially
  // But usually, a navigable calendar should stay where the user put it.
  // However, if the user hasn't interacted, it should show the current month.
  
  const start = startOfWeek(startOfMonth(viewDate));
  const end = endOfWeek(endOfMonth(viewDate));
  const days = eachDayOfInterval({ start, end });
  const weekDays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

  const nextMonth = () => setViewDate(addMonths(viewDate, 1));
  const prevMonth = () => setViewDate(subMonths(viewDate, 1));

  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-slate-900">{format(viewDate, "MMMM yyyy")}</h3>
        <div className="flex gap-2">
          <button 
            onClick={prevMonth}
            className="p-1 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button 
            onClick={nextMonth}
            className="p-1 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-4 text-center">
        {weekDays.map(d => (
          <span key={d} className="text-[10px] font-bold text-slate-400">{d}</span>
        ))}
        {days.map((day, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className={cn(
              "text-xs font-medium w-8 h-8 flex items-center justify-center rounded-xl transition-all",
              !isSameMonth(day, viewDate) ? "text-slate-300" : "text-slate-600",
              isSameDay(day, new Date()) ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "hover:bg-slate-50"
            )}>
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DashboardView = ({ 
  currentTime, 
  onNavigate, 
  performance, 
  events,
  plan,
  syllabus,
  userProfile
}: { 
  currentTime: Date; 
  onNavigate: (view: any) => void;
  performance: PerformanceData | null;
  events: CalendarEvent[];
  plan: string | null;
  syllabus: FileData | null;
  userProfile: any;
}) => {
  const todayEvents = events.filter(e => isSameDay(e.start, currentTime));
  const upcomingStudy = events
    .filter(e => e.type === "study" && e.start >= currentTime)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  
  const firstName = userProfile?.firstName || "Student";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        {/* Welcome Card */}
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full mb-4 uppercase tracking-wider">
              {firstName}'s Workspace
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
              Good {format(currentTime, "H") < "12" ? "morning" : format(currentTime, "H") < "18" ? "afternoon" : "evening"}, {firstName}
            </h2>
            <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
              {syllabus ? "Your syllabus is loaded. Review your progress and continue your tasks." : "Upload your syllabus to get started with your personalized study plan."}
            </p>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => onNavigate("path")}
                className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
              >
                {plan ? "View Study Plan" : "Generate Study Plan"}
              </button>
              <button 
                onClick={() => onNavigate("calendar")}
                className="px-6 py-2.5 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Open Schedule
              </button>
            </div>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-50/50 to-transparent pointer-events-none hidden sm:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Progress Summary */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-6">Progress Summary</h3>
            {!syllabus ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-400 italic">No syllabus uploaded yet.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div>
                    <p className="text-2xl font-black text-slate-900">{performance?.scores.length || 0}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Assessments</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-900">{events.filter(e => e.type === "study").length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Study Sessions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-rose-500">{performance?.weakTopics.length || 0}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Weak Topics</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {performance?.weakTopics.slice(0, 3).map((topic, i) => (
                    <div key={topic}>
                      <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider">
                        <span className="text-slate-500">{topic}</span>
                        <span className="text-slate-900">Focus Needed</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", i === 0 ? "bg-rose-400" : i === 1 ? "bg-amber-400" : "bg-indigo-400")} style={{ width: `${30 + i * 10}%` }} />
                      </div>
                    </div>
                  ))}
                  {(!performance || performance.weakTopics.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Analyze performance to see topic progress.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Suggestion */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-2">Suggestion</h3>
            {upcomingStudy ? (
              <>
                <p className="text-xs text-slate-500 mb-6">Based on your study plan, here is what you should focus on next:</p>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-sm font-black text-indigo-900 mb-1">{upcomingStudy.title}</p>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase">
                    {format(upcomingStudy.start, "EEEE, MMM d")} @ {format(upcomingStudy.start, "h:mm a")}
                  </p>
                </div>
                <button 
                  onClick={() => onNavigate("path")}
                  className="w-full mt-4 py-2 text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  View full plan details
                </button>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <Sparkles className="text-slate-200 mb-4" size={40} />
                <p className="text-xs text-slate-400 italic">Generate a study plan to see daily suggestions.</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Today's Schedule */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-6">Today's Schedule</h3>
            <div className="space-y-4">
              {todayEvents.map(event => (
                <div key={event.id} className="flex items-center gap-4">
                  <div className={cn(
                    "w-1 h-10 rounded-full",
                    event.type === "class" ? "bg-indigo-600" : event.type === "study" ? "bg-amber-400" : "bg-emerald-400"
                  )} />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{format(event.start, "h:mm a")} – {event.title}</p>
                  </div>
                </div>
              ))}
              {todayEvents.length === 0 && <p className="text-xs text-slate-400 italic">No events scheduled for today.</p>}
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-6">Upcoming Deadlines</h3>
            <div className="space-y-4">
              {events
                .filter(e => (e.type === "activity" || e.type === "class") && e.start > currentTime)
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .slice(0, 3)
                .map((event, i) => (
                  <div key={event.id} className="flex items-center gap-3">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      event.type === "class" ? "bg-indigo-500" : "bg-emerald-500"
                    )} />
                    <div>
                      <p className="text-xs font-bold text-slate-700">{event.title}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{format(event.start, "MMM d, h:mm a")}</p>
                    </div>
                  </div>
                ))}
              {events.filter(e => (e.type === "activity" || e.type === "class") && e.start > currentTime).length === 0 && (
                <p className="text-xs text-slate-400 italic">No upcoming deadlines or classes.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Date/Time Widget */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm text-center">
          <h2 className="text-4xl font-black text-slate-900 mb-1">{format(currentTime, "h:mm:ss a")}</h2>
          <p className="text-sm font-bold text-indigo-600 mb-4">{format(currentTime, "EEEE, MMMM do")}</p>
          <div className="h-px bg-slate-100 w-12 mx-auto mb-4" />
          <p className="text-xs text-slate-500 italic leading-relaxed">
            "The only way to learn a new programming language is by writing programs in it."
          </p>
        </div>

        {/* Calendar Widget */}
        <MiniCalendar date={currentTime} />
      </div>
    </div>
  );
};
const FileUploadCard = ({ 
  title, 
  description, 
  icon: Icon, 
  onFileSelect, 
  file,
  accept = ".pdf,.docx,.txt,.json,.md,.csv",
  helpContent
}: { 
  title: string; 
  description: string; 
  icon: any; 
  onFileSelect: (content: string, name: string) => void;
  file: FileData | null;
  accept?: string;
  helpContent?: {
    tooltip: string;
    instructions: string[];
  };
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isHoveringHelp, setIsHoveringHelp] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const fileName = selectedFile.name.toLowerCase();
    
    try {
      if (fileName.endsWith(".pdf")) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          fullText += pageText + "\n";
        }
        onFileSelect(fullText, selectedFile.name);
      } else if (fileName.endsWith(".docx")) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        onFileSelect(result.value, selectedFile.name);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          onFileSelect(event.target?.result as string, selectedFile.name);
        };
        reader.readAsText(selectedFile);
      }
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file content. Please try a different file format.");
    }
  };

  return (
    <div 
      className={cn(
        "relative group p-5 rounded-2xl border-2 border-dashed transition-all duration-300 bg-white",
        file 
          ? "border-emerald-200 bg-emerald-50/10" 
          : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/10"
      )}
    >
      {helpContent && (
        <div className="absolute top-4 right-4 z-20">
          <div className="relative">
            <button
              onMouseEnter={() => setIsHoveringHelp(true)}
              onMouseLeave={() => setIsHoveringHelp(false)}
              onClick={() => setShowHelp(!showHelp)}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-all"
            >
              <Info size={14} />
            </button>
            
            <AnimatePresence>
              {isHoveringHelp && !showHelp && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg shadow-xl pointer-events-none text-center"
                >
                  {helpContent.tooltip}
                  <div className="absolute top-full right-2 border-8 border-transparent border-t-slate-900" />
                </motion.div>
              )}

              {showHelp && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-64 p-4 bg-white rounded-2xl shadow-2xl border border-slate-100 z-30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Instructions</h4>
                    <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-600">
                      <Plus size={14} className="rotate-45" />
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {helpContent.instructions.map((step, i) => (
                      <li key={i} className="flex gap-2 text-[10px] text-slate-600 leading-relaxed">
                        <span className="font-black text-indigo-600">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept={accept}
      />
      <div className="flex items-start gap-4 mb-4">
        <div className={cn(
          "p-2.5 rounded-xl transition-colors",
          file ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600"
        )}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {file && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-100/50 w-full px-2 py-1.5 rounded-lg border border-emerald-200">
            <CheckCircle2 size={10} />
            <span className="truncate">{file.name}</span>
          </div>
        )}
        <button 
          onClick={() => inputRef.current?.click()}
          className={cn(
            "w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
            file 
              ? "bg-emerald-600 text-white hover:bg-emerald-700" 
              : "bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white"
          )}
        >
          <Upload size={14} />
          {file ? "Change File" : "Upload File"}
        </button>
      </div>
    </div>
  );
};

const CalendarView = ({ events }: { events: CalendarEvent[] }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black text-slate-900">{format(currentMonth, "MMMM yyyy")}</h2>
          <div className="flex gap-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronLeft size={20} /></button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronRight size={20} /></button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter(e => isSameDay(e.start, day));
          return (
            <div key={i} className={cn(
              "min-h-[140px] p-4 border-r border-b border-slate-50 transition-colors hover:bg-slate-50/50",
              !isSameMonth(day, currentMonth) && "bg-slate-50/30"
            )}>
              <span className={cn(
                "text-sm font-bold",
                isSameDay(day, new Date()) ? "text-indigo-600" : "text-slate-400",
                !isSameMonth(day, currentMonth) && "opacity-30"
              )}>{format(day, "d")}</span>
              <div className="mt-2 space-y-1">
                {dayEvents.map(event => (
                  <div key={event.id} className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-bold truncate",
                    event.type === "class" ? "bg-indigo-50 text-indigo-600" : event.type === "study" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {event.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StudyPlanView = ({ 
  plan, 
  isGenerating, 
  error, 
  onGenerate, 
  onCancel,
  syllabus,
  calendarFile,
  setSyllabus,
  setCalendarFile,
  onFeedback,
  semesterDates,
  setSemesterDates,
  chatMessages,
  chatHistory,
  isTweaking,
  onTweakPlan,
  onSelectHistory
}: any) => {
  const [userFeedback, setUserFeedback] = useState<"up" | "down" | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [isDataSourcesOpen, setIsDataSourcesOpen] = useState(!plan);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleFeedback = (type: "up" | "down") => {
    setUserFeedback(type);
    onFeedback(type);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isTweaking) return;
    onTweakPlan(chatInput);
    setChatInput("");
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-200px)] relative">
      {/* Left Sidebar: Chat History */}
      <AnimatePresence mode="wait">
        {plan && isHistoryVisible && (
          <motion.aside 
            initial={{ opacity: 0, x: -20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 256 }}
            exit={{ opacity: 0, x: -20, width: 0 }}
            className="w-full lg:w-64 flex-shrink-0 space-y-4 overflow-hidden"
          >
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={14} /> Chat Logs
                </h3>
              </div>
              <div className="space-y-2 max-h-[300px] lg:max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {chatHistory.length > 0 ? chatHistory.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectHistory(item)}
                    className="w-full text-left p-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-100 truncate"
                  >
                    {item.title}
                  </button>
                )) : (
                  <p className="text-[10px] text-slate-400 italic">No previous tweaks</p>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Toggle History Button */}
      {plan && (
        <button 
          onClick={() => setIsHistoryVisible(!isHistoryVisible)}
          className={cn(
            "absolute -left-4 top-4 z-10 p-2 bg-white border border-slate-100 rounded-full shadow-sm text-slate-400 hover:text-indigo-600 transition-all hidden lg:flex",
            !isHistoryVisible && "left-0"
          )}
          title={isHistoryVisible ? "Hide History" : "Show History"}
        >
          {isHistoryVisible ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      )}

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        {/* Collapsible Data Sources */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => setIsDataSourcesOpen(!isDataSourcesOpen)}
            className="w-full p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <BookOpen size={20} />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-black text-slate-900">Student Files</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Upload & Configuration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {!isDataSourcesOpen && plan && (
                <div className="hidden sm:flex items-center gap-2">
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">Syllabus Loaded</div>
                  <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">Calendar Loaded</div>
                </div>
              )}
              <div className={cn("p-2 rounded-lg bg-slate-50 text-slate-400 transition-transform", isDataSourcesOpen && "rotate-180")}>
                <ChevronDown size={16} />
              </div>
            </div>
          </button>

          <AnimatePresence>
            {isDataSourcesOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-8 pt-0 border-t border-slate-50">
                  <div className="flex items-center justify-end mb-6">
                    <div className="flex items-center gap-2">
                      {(isGenerating || error) && (
                        <button 
                          onClick={onCancel}
                          className="px-4 py-2.5 bg-slate-100 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        onClick={onGenerate}
                        disabled={isGenerating || !syllabus || !calendarFile}
                        className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {plan ? "Update Plan" : "Generate Plan"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock size={16} className="text-indigo-600" />
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Semester Duration</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                        <input 
                          type="date" 
                          value={semesterDates.start}
                          onChange={(e) => setSemesterDates({ ...semesterDates, start: e.target.value })}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
                        <input 
                          type="date" 
                          value={semesterDates.end}
                          onChange={(e) => setSemesterDates({ ...semesterDates, end: e.target.value })}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FileUploadCard 
                      title="Course Outline/Syllabus"
                      description="Upload your course outline for the subject. (.PDF, .DOCX, .TXT)."
                      icon={BookOpen}
                      file={syllabus}
                      accept=".pdf,.docx,.txt"
                      onFileSelect={(content, name) => setSyllabus({ content, name, type: "syllabus" })}
                    />
                    <FileUploadCard 
                      title="Calendar"
                      description="Upload your class schedule or academic calendar. (.PDF, .DOCX)."
                      icon={CalendarIcon}
                      file={calendarFile}
                      accept=".pdf,.docx"
                      onFileSelect={(content, name) => setCalendarFile({ content, name, type: "calendar" })}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Plan Display */}
          <div className={cn(
            "bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col",
            plan ? "xl:col-span-2" : "xl:col-span-3"
          )}>
            {plan && (
              <div className="px-8 pt-8 flex items-center justify-between border-b border-slate-50 pb-6">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI Generated Plan</span>
                  <div className="h-4 w-px bg-slate-100" />
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleFeedback("up")}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        userFeedback === "up" ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                      )}
                      title="Helpful"
                    >
                      <ThumbsUp size={16} />
                    </button>
                    <button 
                      onClick={() => handleFeedback("down")}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        userFeedback === "down" ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                      )}
                      title="Not helpful"
                    >
                      <ThumbsDown size={16} />
                    </button>
                  </div>
                </div>
                <button 
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all"
                >
                  <RefreshCw size={14} className={cn(isGenerating && "animate-spin")} />
                  Regenerate
                </button>
              </div>
            )}
            
            <div className="flex-1 p-8 sm:p-12 prose prose-slate max-w-none overflow-y-auto max-h-[800px] custom-scrollbar">
              <AnimatePresence mode="wait">
                {plan ? (
                  <motion.div
                    key={plan} // Key change triggers animation on update
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <ReactMarkdown>{plan}</ReactMarkdown>
                  </motion.div>
                ) : (
                  <div className="text-center py-20">
                    <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                      <Target size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">No Study Plan Generated</h3>
                    <p className="text-slate-500 mt-2">Upload your syllabus and calendar above to generate an adaptive plan.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Chat Interface */}
          {plan && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm flex flex-col h-[600px] xl:h-auto overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex items-center gap-3 bg-slate-50/30">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Personalize</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tweak your plan</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mb-4">
                      <Sparkles size={24} />
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      "I want to focus more on coding exercises on weekends" or "Make my study sessions shorter but more frequent."
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg: any, i: number) => (
                    <div key={i} className={cn(
                      "flex flex-col max-w-[90%]",
                      msg.role === "user" ? "ml-auto items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "p-4 rounded-2xl text-xs leading-relaxed",
                        msg.role === "user" 
                          ? "bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100" 
                          : "bg-slate-100 text-slate-700 rounded-tl-none"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isTweaking && (
                  <div className="flex items-start max-w-[90%]">
                    <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="p-6 border-t border-slate-50 bg-slate-50/30">
                <div className="relative group">
                  <textarea 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Tell the AI changes you would like to make..."
                    disabled={isTweaking}
                    rows={3}
                    className="w-full pl-4 pr-12 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 resize-none shadow-sm group-hover:border-slate-300"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit(e as any);
                      }
                    }}
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isTweaking}
                    className="absolute right-3 bottom-3 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-slate-400 text-center font-medium">
                  Press Enter to send, Shift + Enter for new line
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const QuizView = ({ activity, onComplete, onCancel }: { activity: Activity; onComplete: (score: number, total: number) => void; onCancel: () => void }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D">>( {});
  const [showResult, setShowResult] = useState(false);

  const currentQuestion = activity.questions[currentQuestionIndex];

  const handleAnswer = (answer: "A" | "B" | "C" | "D") => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < activity.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setShowResult(true);
    }
  };

  const calculateScore = () => {
    let score = 0;
    activity.questions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) score++;
    });
    return score;
  };

  if (showResult) {
    const score = calculateScore();
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-2xl text-center">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Quiz Completed!</h2>
          <p className="text-slate-500 mb-8">Great job finishing the {activity.title} activity.</p>
          
          <div className="bg-slate-50 rounded-3xl p-8 mb-8">
            <div className="text-5xl font-black text-slate-900 mb-2">{score} / {activity.questions.length}</div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your Final Score</p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => onComplete(score, activity.questions.length)}
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              Finish & Record Score
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onCancel} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-all">
          <ChevronLeft size={18} /> Exit Quiz
        </button>
        <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Question {currentQuestionIndex + 1} of {activity.questions.length}
        </div>
      </div>

      <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-xl">
        <h3 className="text-xl font-black text-slate-900 mb-8 leading-relaxed">
          {currentQuestion.text}
        </h3>

        <div className="grid grid-cols-1 gap-4 mb-10">
          {(["A", "B", "C", "D"] as const).map(option => (
            <button
              key={option}
              onClick={() => handleAnswer(option)}
              className={cn(
                "w-full p-6 rounded-2xl border-2 text-left transition-all flex items-center gap-4 group",
                answers[currentQuestion.id] === option 
                  ? "border-indigo-600 bg-indigo-50/50" 
                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all",
                answers[currentQuestion.id] === option 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
              )}>
                {option}
              </div>
              <span className={cn(
                "font-bold text-sm",
                answers[currentQuestion.id] === option ? "text-indigo-900" : "text-slate-600"
              )}>
                {currentQuestion.options[option]}
              </span>
            </button>
          ))}
        </div>

        <button
          disabled={!answers[currentQuestion.id]}
          onClick={nextQuestion}
          className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {currentQuestionIndex === activity.questions.length - 1 ? "Finish Quiz" : "Next Question"}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

const ActivitiesView = ({ 
  activities, 
  isGenerating, 
  error, 
  onGenerate, 
  onCancel,
  onStartActivity
}: any) => {
  const [isDataExpanded, setIsDataExpanded] = useState(true);

  const studentScores = [
    { module: "01", name: "Laboratory Exercise I", task: "Introduction to Programming Languages", score: "45/50" },
    { module: "02", name: "Laboratory Exercise I", task: "Syntax and semantics", score: "40/40" },
    { module: "02", name: "Performance Task I", task: "Syntax and Semantics", score: "50/60" },
    { module: "03", name: "Laboratory Exercise 1", task: "Lexical and Syntax Analysis", score: "50/80" },
    { module: "03", name: "Laboratory Exercise 2", task: "Lexical and Syntax Analysis", score: "100/100" },
    { module: "04", name: "Performance Task 1", task: "Names, Bindings, and Scopes", score: "80/80" }
  ];

  return (
    <div className="space-y-8">
      {/* Teacher's Data Container */}
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <button 
          onClick={() => setIsDataExpanded(!isDataExpanded)}
          className="w-full p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <ClipboardList size={20} />
            </div>
            <div className="text-left">
              <h2 className="text-lg font-black text-slate-900">Teacher's Data about Student</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Locked • View Only</p>
            </div>
          </div>
          <div className={cn("transition-transform duration-300", isDataExpanded ? "rotate-180" : "")}>
            <ChevronDown size={24} className="text-slate-400" />
          </div>
        </button>

        <AnimatePresence>
          {isDataExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-8 pt-0 space-y-8">
                {/* Student Data Section */}
                <div className="bg-slate-50/50 rounded-[32px] p-8 border border-slate-100">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Student Data</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student Level</label>
                      <div className="px-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900">
                        Beginner
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pre-Test Score</label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 px-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 text-center">
                          40
                        </div>
                        <span className="text-slate-300 font-bold">/</span>
                        <div className="flex-1 px-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 text-center">
                          100
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Professor</label>
                      <div className="px-6 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-900">
                        Ms. Esther Reyes
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity Scores Table */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest ml-1">Activity Scores for Programming Languages</h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={onGenerate}
                        disabled={isGenerating}
                        className="px-6 py-2.5 bg-emerald-600 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Sync & Analyze
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-6 py-4">Activity Name</th>
                          <th className="px-6 py-4 text-center">Module No</th>
                          <th className="px-6 py-4 text-right">Scores</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {studentScores.map((score, i) => (
                          <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-5">
                              <p className="text-sm font-bold text-slate-900">{score.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{score.task}</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className="text-xs font-mono font-bold text-slate-500">{score.module}</span>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg">
                                {score.score}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {activities && activities.length > 0 ? activities.map((activity: Activity) => (
          <div key={activity.id} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-100 transition-all group flex flex-col">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <ClipboardList size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">{activity.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-8 flex-1">{activity.description}</p>
            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Clock size={12} /> {activity.questions.length} Questions
              </div>
              <button 
                onClick={() => onStartActivity(activity)}
                className="px-6 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-emerald-600 transition-all flex items-center gap-2"
              >
                Start Activity <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )) : !isGenerating && (
          <div className="col-span-full bg-white p-20 rounded-[32px] border border-slate-100 shadow-sm text-center">
            <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300">
              <ClipboardList size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No Personalized Activities</h3>
            <p className="text-slate-500 mt-2">Analyze your performance above to get targeted remedial tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const PerformanceView = ({ performance, initialHistory, mockScores, quizResults }: any) => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Weak Topics */}
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-rose-600">
          <AlertCircle size={20} />
          Areas of Difficulty (Weak Topics)
        </h2>
        <div className="space-y-3">
          {performance?.weakTopics.length ? performance.weakTopics.map((topic: string, i: number) => (
            <div key={i} className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
              <span className="font-bold text-rose-900">{topic}</span>
              <ChevronRight size={16} className="text-rose-300" />
            </div>
          )) : (
            <p className="text-slate-400 text-sm italic">Analyze performance to see weak topics.</p>
          )}
        </div>
      </div>

      {/* Strong Topics */}
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-emerald-600">
          <CheckCircle2 size={20} />
          Areas of Mastery (Strong Topics)
        </h2>
        <div className="space-y-3">
          {performance?.strongTopics.length ? performance.strongTopics.map((topic: string, i: number) => (
            <div key={i} className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <span className="font-bold text-emerald-900">{topic}</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
          )) : (
            <p className="text-slate-400 text-sm italic">Analyze performance to see strong topics.</p>
          )}
        </div>
      </div>
    </div>

    {/* Quiz Results */}
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-black flex items-center gap-2">
          <ClipboardList size={20} className="text-indigo-600" />
          Remedial Quiz Results
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quizResults.length > 0 ? quizResults.map((result: QuizResult) => (
          <div key={result.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{result.date}</span>
              <span className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-black",
                (result.score / result.total) >= 0.8 ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
              )}>
                {Math.round((result.score / result.total) * 100)}%
              </span>
            </div>
            <h4 className="text-sm font-black text-slate-900 mb-2">{result.activityTitle}</h4>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000" 
                  style={{ width: `${(result.score / result.total) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-600">{result.score}/{result.total}</span>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-12 text-center">
            <p className="text-sm text-slate-400 italic">No quizzes completed yet.</p>
          </div>
        )}
      </div>
    </div>

    {/* Score Table */}
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100">
        <h2 className="text-lg font-black text-slate-900">Academic Records</h2>
        <p className="text-xs text-slate-500 mt-1">Official scores from Teacher's Score Sheet (Read-only)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assessment</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Score</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {mockScores.map((record: ScoreRecord) => (
              <tr key={record.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="px-8 py-5 font-bold text-slate-900 text-sm">{record.assessment}</td>
                <td className="px-8 py-5 text-slate-500 text-sm">{record.subject}</td>
                <td className="px-8 py-5 text-center">
                  <span className="font-black text-slate-900">{record.score}</span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span className="text-slate-400 text-xs">{record.maxScore}</span>
                </td>
                <td className="px-8 py-5 text-center">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                    (record.score / record.maxScore) >= 0.75 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                  )}>
                    {(record.score / record.maxScore) >= 0.75 ? "Passed" : "Needs Review"}
                  </span>
                </td>
                <td className="px-8 py-5 text-right text-slate-400 text-xs font-medium">{record.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Detailed Improvement Graph */}
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm h-[500px]">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-black flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-600" />
          Performance Improvement Over Time
        </h2>
        <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black">
          +{performance?.improvementScore || 0}% Total Growth
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={performance?.history || initialHistory}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
          <Tooltip 
            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          <Line type="monotone" dataKey="score" stroke="#4F46E5" strokeWidth={4} dot={{ r: 6, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const TeacherDashboard = () => (
  <div className="space-y-8">
    <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm text-center">
      <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <GraduationCap size={40} />
      </div>
      <h1 className="text-3xl font-black text-slate-900 mb-4">Teacher Dashboard</h1>
      <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
        Welcome to the Teacher Portal. Here you will be able to manage courses, track student progress, and review AI-generated study plans.
      </p>
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Students", value: "124", icon: Users },
          { label: "Active Courses", value: "8", icon: BookOpen },
          { label: "Pending Reviews", value: "12", icon: ClipboardList }
        ].map((stat, i) => (
          <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <stat.icon size={20} className="text-indigo-600 mb-3 mx-auto" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-xl font-black text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <h2 className="text-lg font-black mb-6 flex items-center gap-2">
          <Bell size={20} className="text-indigo-600" />
          Recent Alerts
        </h2>
        <div className="space-y-4">
          {[
            { title: "Low Performance Alert", student: "John Doe", course: "Data Structures", time: "2h ago" },
            { title: "New Feedback Received", student: "Jane Smith", course: "Algorithms", time: "4h ago" },
            { title: "Study Plan Review Needed", student: "Mike Ross", course: "Database Systems", time: "1d ago" }
          ].map((alert, i) => (
            <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">{alert.title}</p>
                <p className="text-xs text-slate-500">{alert.student} • {alert.course}</p>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">{alert.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <h2 className="text-lg font-black mb-6 flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-600" />
          Class Performance
        </h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[
              { name: 'Week 1', score: 65 },
              { name: 'Week 2', score: 72 },
              { name: 'Week 3', score: 68 },
              { name: 'Week 4', score: 85 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" hide />
              <YAxis hide />
              <Tooltip />
              <Area type="monotone" dataKey="score" stroke="#4F46E5" fill="#EEF2FF" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </div>
);

const AlertsView = () => (
  <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
        <Bell size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-black text-slate-900">Teacher Alerts</h1>
        <p className="text-slate-500 text-sm">Monitor critical student performance and system notifications</p>
      </div>
    </div>
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-6">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-rose-500 shadow-sm">
            <AlertCircle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-slate-900">Critical: Low Quiz Score</h3>
            <p className="text-sm text-slate-500">Student ID #2024-001 scored below 50% in the "Data Structures" quiz.</p>
          </div>
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all">
            Take Action
          </button>
        </div>
      ))}
    </div>
  </div>
);

interface Student {
  id: string;
  name: string;
  section: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  status: "Active" | "Inactive";
  gpa: number;
}

const StudentListView = () => {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"name" | "level" | "gpa">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sections = ["BSIT - 1A", "BSIT - 1B", "BSIT - 1C"];
  
  const dummyStudents: Student[] = [
    // BSIT - 1A
    { id: "2024-001", name: "Alice Johnson", section: "BSIT - 1A", level: "Beginner", status: "Active", gpa: 3.5 },
    { id: "2024-002", name: "Bob Smith", section: "BSIT - 1A", level: "Intermediate", status: "Active", gpa: 3.2 },
    { id: "2024-003", name: "Charlie Brown", section: "BSIT - 1A", level: "Advanced", status: "Active", gpa: 3.8 },
    { id: "2024-004", name: "David Miller", section: "BSIT - 1A", level: "Beginner", status: "Inactive", gpa: 2.9 },
    { id: "2024-005", name: "Eve Wilson", section: "BSIT - 1A", level: "Intermediate", status: "Active", gpa: 3.4 },
    { id: "2024-006", name: "Frank Thomas", section: "BSIT - 1A", level: "Advanced", status: "Active", gpa: 3.9 },
    { id: "2024-007", name: "Grace Lee", section: "BSIT - 1A", level: "Beginner", status: "Active", gpa: 3.1 },
    { id: "2024-008", name: "Henry Davis", section: "BSIT - 1A", level: "Intermediate", status: "Active", gpa: 3.3 },
    { id: "2024-009", name: "Ivy Garcia", section: "BSIT - 1A", level: "Advanced", status: "Active", gpa: 3.7 },
    { id: "2024-010", name: "Jack White", section: "BSIT - 1A", level: "Beginner", status: "Active", gpa: 3.0 },
    
    // BSIT - 1B
    { id: "2024-011", name: "Kelly Green", section: "BSIT - 1B", level: "Intermediate", status: "Active", gpa: 3.6 },
    { id: "2024-012", name: "Liam Neeson", section: "BSIT - 1B", level: "Advanced", status: "Active", gpa: 4.0 },
    { id: "2024-013", name: "Mia Wong", section: "BSIT - 1B", level: "Beginner", status: "Active", gpa: 3.2 },
    { id: "2024-014", name: "Noah Ark", section: "BSIT - 1B", level: "Intermediate", status: "Inactive", gpa: 2.8 },
    { id: "2024-015", name: "Olivia Pope", section: "BSIT - 1B", level: "Advanced", status: "Active", gpa: 3.9 },
    { id: "2024-016", name: "Peter Parker", section: "BSIT - 1B", level: "Beginner", status: "Active", gpa: 3.4 },
    { id: "2024-017", name: "Quinn Fabray", section: "BSIT - 1B", level: "Intermediate", status: "Active", gpa: 3.5 },
    { id: "2024-018", name: "Riley Reid", section: "BSIT - 1B", level: "Advanced", status: "Active", gpa: 3.7 },
    { id: "2024-019", name: "Sam Winchester", section: "BSIT - 1B", level: "Beginner", status: "Active", gpa: 3.1 },
    { id: "2024-020", name: "Tina Fey", section: "BSIT - 1B", level: "Intermediate", status: "Active", gpa: 3.3 },

    // BSIT - 1C
    { id: "2024-021", name: "Uma Thurman", section: "BSIT - 1C", level: "Advanced", status: "Active", gpa: 3.8 },
    { id: "2024-022", name: "Victor Hugo", section: "BSIT - 1C", level: "Beginner", status: "Active", gpa: 3.0 },
    { id: "2024-023", name: "Wendy Darling", section: "BSIT - 1C", level: "Intermediate", status: "Active", gpa: 3.4 },
    { id: "2024-024", name: "Xander Cage", section: "BSIT - 1C", level: "Advanced", status: "Inactive", gpa: 2.7 },
    { id: "2024-025", name: "Yara Greyjoy", section: "BSIT - 1C", level: "Beginner", status: "Active", gpa: 3.2 },
    { id: "2024-026", name: "Zane Grey", section: "BSIT - 1C", level: "Intermediate", status: "Active", gpa: 3.5 },
    { id: "2024-027", name: "Arthur Dent", section: "BSIT - 1C", level: "Advanced", status: "Active", gpa: 3.9 },
    { id: "2024-028", name: "Bilbo Baggins", section: "BSIT - 1C", level: "Beginner", status: "Active", gpa: 3.1 },
    { id: "2024-029", name: "Catelyn Stark", section: "BSIT - 1C", level: "Intermediate", status: "Active", gpa: 3.6 },
    { id: "2024-030", name: "Dobby Elf", section: "BSIT - 1C", level: "Advanced", status: "Active", gpa: 3.7 },
  ];

  const filteredStudents = dummyStudents
    .filter(s => !selectedSection || s.section === selectedSection)
    .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm))
    .filter(s => filterLevel === "All" || s.level === filterLevel)
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") comparison = a.name.localeCompare(b.name);
      if (sortBy === "gpa") comparison = a.gpa - b.gpa;
      if (sortBy === "level") {
        const levels = { "Beginner": 1, "Intermediate": 2, "Advanced": 3 };
        comparison = levels[a.level] - levels[b.level];
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  const handleSort = (key: "name" | "level" | "gpa") => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Student Management</h1>
              <p className="text-slate-500 text-sm">
                {selectedSection ? `Viewing students in ${selectedSection}` : "Select a section to view student details"}
              </p>
            </div>
          </div>
          {selectedSection && (
            <button 
              onClick={() => setSelectedSection(null)}
              className="px-4 py-2 text-indigo-600 font-bold text-sm hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-2"
            >
              <ChevronLeft size={16} /> Back to Sections
            </button>
          )}
        </div>

        {!selectedSection ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections.map((section) => {
              const count = dummyStudents.filter(s => s.section === section).length;
              return (
                <motion.button
                  key={section}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedSection(section)}
                  className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Users size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">{section}</h3>
                  <p className="text-sm text-slate-500 mb-6">Information Technology Department</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{count} Students</span>
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search by name or ID..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <div className="flex gap-4">
                <select 
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  <option value="All">All Levels</option>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
                <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                  <button 
                    onClick={() => handleSort("name")}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      sortBy === "name" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Name
                  </button>
                  <button 
                    onClick={() => handleSort("level")}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      sortBy === "level" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Level
                  </button>
                  <button 
                    onClick={() => handleSort("gpa")}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      sortBy === "gpa" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    GPA
                  </button>
                </div>
              </div>
            </div>

            {/* Student Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Student</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student ID</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Level</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">GPA</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <AnimatePresence mode="popLayout">
                    {filteredStudents.map((student) => (
                      <motion.tr 
                        key={student.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="group hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-5 pl-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-sm">
                              {student.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{student.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{student.section}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 text-sm text-slate-500 font-medium">{student.id}</td>
                        <td className="py-5">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                            student.level === "Advanced" ? "bg-indigo-100 text-indigo-600" :
                            student.level === "Intermediate" ? "bg-amber-100 text-amber-600" :
                            "bg-slate-100 text-slate-500"
                          )}>
                            {student.level}
                          </span>
                        </td>
                        <td className="py-5 text-center">
                          <span className="text-sm font-black text-slate-700">{student.gpa.toFixed(2)}</span>
                        </td>
                        <td className="py-5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", student.status === "Active" ? "bg-emerald-500" : "bg-slate-300")} />
                            <span className="text-[10px] font-black text-slate-500 uppercase">{student.status}</span>
                          </div>
                        </td>
                        <td className="py-5 text-right pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-lg">
                              <Eye size={16} />
                            </button>
                            <button className="p-2 text-slate-400 hover:text-rose-600 transition-colors bg-slate-50 rounded-lg">
                              <Plus size={16} className="rotate-45" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
              {filteredStudents.length === 0 && (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-400">No students found matching your criteria</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StudyPlansView = () => (
  <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
        <Target size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-black text-slate-900">Study Plans</h1>
        <p className="text-slate-500 text-sm">Review and approve AI-generated study plans for your students</p>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Student Plan</p>
                <h3 className="font-black text-slate-900">John Doe - Week 4</h3>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-100 text-amber-600 rounded-full text-[10px] font-black uppercase">Pending</span>
          </div>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            This plan focuses on "Binary Search Trees" and "Graph Algorithms" based on recent quiz performance.
          </p>
          <div className="flex gap-3">
            <button className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 transition-all">
              Approve Plan
            </button>
            <button className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-50 transition-all">
              Modify
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const PerformanceMonitoringView = () => (
  <div className="space-y-8">
    <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
          <Activity size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Performance Monitoring</h1>
          <p className="text-slate-500 text-sm">Track real-time academic progress across all sections</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {[
          { label: "Average GPA", value: "3.4", trend: "+0.2", icon: TrendingUp },
          { label: "Completion Rate", value: "88%", trend: "+5%", icon: CheckCircle2 },
          { label: "At-Risk Students", value: "5", trend: "-2", icon: AlertCircle },
        ].map((stat, i) => (
          <div key={i} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <stat.icon size={24} className="text-indigo-600" />
              <span className={cn(
                "text-[10px] font-black px-2 py-1 rounded-lg",
                stat.trend.startsWith("+") ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
              )}>
                {stat.trend}
              </span>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-3xl font-black text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 h-[400px]">
        <h3 className="text-sm font-black text-slate-900 mb-6">Overall Performance Trend</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[
            { month: 'Jan', score: 70 },
            { month: 'Feb', score: 75 },
            { month: 'Mar', score: 72 },
            { month: 'Apr', score: 80 },
            { month: 'May', score: 85 },
          ]}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
            <Tooltip />
            <Line type="monotone" dataKey="score" stroke="#4F46E5" strokeWidth={4} dot={{ r: 6, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);

const FeedbackView = () => (
  <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
        <MessageSquare size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-black text-slate-900">Student Feedback</h1>
        <p className="text-slate-500 text-sm">Review comments and suggestions from your students</p>
      </div>
    </div>
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm font-black text-xs">
                JD
              </div>
              <div>
                <h3 className="font-black text-slate-900">John Doe</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Structures • 2h ago</p>
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Sparkles key={star} size={12} className={star <= 4 ? "text-amber-400 fill-amber-400" : "text-slate-200"} />
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed italic">
            "The AI-generated study plan really helped me understand recursion better. The exercises were challenging but fair."
          </p>
        </div>
      ))}
    </div>
  </div>
);

const ResourcesView = () => (
  <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
          <Library size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Resources</h1>
          <p className="text-slate-500 text-sm">Upload and manage learning materials for your students</p>
        </div>
      </div>
      <button className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
        <Upload size={18} />
        Upload Resource
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[
        { title: "Introduction to Algorithms", type: "PDF", size: "2.4 MB" },
        { title: "Database Systems Lecture", type: "MP4", size: "45 MB" },
        { title: "Coding Standards Guide", type: "DOCX", size: "1.1 MB" },
        { title: "Network Security Basics", type: "PDF", size: "3.8 MB" },
      ].map((resource, i) => (
        <div key={i} className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-indigo-200 transition-all group">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm mb-4 transition-colors">
            <FileText size={24} />
          </div>
          <h3 className="font-black text-slate-900 mb-1">{resource.title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{resource.type} • {resource.size}</p>
          <div className="flex gap-2">
            <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all">
              <Download size={16} />
            </button>
            <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-rose-600 transition-all">
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MISDashboard = ({ 
  teachers, 
  students, 
  sections,
  initialTab = "teachers"
}: { 
  teachers: any[], 
  students: any[], 
  sections: any[],
  initialTab?: "teachers" | "students" | "sections"
}) => {
  const [activeTab, setActiveTab] = useState<"teachers" | "students" | "sections">(initialTab);
  
  // Sync tab if prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form States
  const [formData, setFormData] = useState<any>({});

  const handleOpenModal = (item: any = null) => {
    setEditingItem(item);
    setFormData(item || {});
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === "teachers") {
        if (editingItem) {
          await updateDoc(doc(db, "teachers", editingItem.id), formData);
        } else {
          await addDoc(collection(db, "teachers"), formData);
        }
      } else if (activeTab === "students") {
        if (editingItem) {
          await updateDoc(doc(db, "students", editingItem.id), formData);
        } else {
          await addDoc(collection(db, "students"), formData);
        }
      } else {
        if (editingItem) {
          await updateDoc(doc(db, "sections", editingItem.id), formData);
        } else {
          await addDoc(collection(db, "sections"), formData);
        }
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteDoc(doc(db, activeTab, id));
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">MIS Workspace</h1>
          <p className="text-slate-500 text-sm mt-1">Manage {activeTab} and academic structure</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              {activeTab === "teachers" ? <GraduationCap size={20} /> : activeTab === "students" ? <Users size={20} /> : <Library size={20} />}
            </div>
            <h2 className="text-lg font-black text-slate-900 capitalize">{activeTab} List</h2>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2 transition-all"
          >
            <Plus size={16} />
            Add {activeTab.slice(0, -1)}
          </button>
        </div>

        <div className="p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                <th className="px-8 py-4">Name</th>
                {activeTab === "teachers" && <th className="px-8 py-4">Position / Spec</th>}
                {activeTab === "students" && <th className="px-8 py-4">Section</th>}
                {activeTab === "sections" && <th className="px-8 py-4">Prog. Teacher</th>}
                <th className="px-8 py-4">Email / ID</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(activeTab === "teachers" ? teachers : activeTab === "students" ? students : sections).map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-900">{item.name}</p>
                  </td>
                  {activeTab === "teachers" && (
                    <td className="px-8 py-5">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase">
                        {item.title} {item.specialization ? `| ${item.specialization}` : ""}
                      </span>
                    </td>
                  )}
                  {activeTab === "students" && (
                    <td className="px-8 py-5">
                      <p className="text-xs text-slate-500">
                        {sections.find(s => s.id === item.sectionId)?.name || "Unassigned"}
                      </p>
                    </td>
                  )}
                  {activeTab === "sections" && (
                    <td className="px-8 py-5">
                      <p className="text-xs text-slate-500 font-bold">
                        {teachers.find(t => t.id === item.programmingTeacherId)?.name || "Not assigned"}
                      </p>
                    </td>
                  )}
                  <td className="px-8 py-5">
                    <p className="text-xs text-slate-400 font-mono">{item.email || item.id}</p>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(item)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <FileText size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(activeTab === "teachers" ? teachers : activeTab === "students" ? students : sections).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="max-w-xs mx-auto">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-200">
                        <Plus size={32} />
                      </div>
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">No records found</p>
                      <p className="text-xs text-slate-400 mt-2">Start by adding your first {activeTab.slice(0, -1)} to the system.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Total Teachers", count: teachers.length, icon: GraduationCap, color: "indigo" },
          { label: "Total Students", count: students.length, icon: Users, color: "emerald" },
          { label: "Class Sections", count: sections.length, icon: Library, color: "amber" }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", `bg-${stat.color}-50 text-${stat.color}-600`)}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-black text-slate-900 capitalize">
                  {editingItem ? 'Edit' : 'Add New'} {activeTab.slice(0, -1)}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white rounded-xl transition-all"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      placeholder="Enter name"
                    />
                  </div>

                  {activeTab === "teachers" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Position</label>
                        <select 
                          value={formData.title || ""}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                        >
                          <option value="">Select</option>
                          <option value="Instructor">Instructor</option>
                          <option value="Professor">Professor</option>
                          <option value="Associate Professor">Asst. Professor</option>
                          <option value="IT Head">IT Head</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Section Handled</label>
                        <input 
                          type="text" 
                          value={formData.sectionsHandled || ""}
                          onChange={(e) => setFormData({ ...formData, sectionsHandled: e.target.value })}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                          placeholder="e.g. BSIT 1-A"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={formData.email || ""}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      placeholder="email@university.edu"
                    />
                  </div>

                  {activeTab === "students" && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assign Section</label>
                      <select 
                        value={formData.sectionId || ""}
                        onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      >
                        <option value="">Select Section</option>
                        {sections.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {activeTab === "sections" && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Programming Teacher</label>
                      <select 
                        value={formData.programmingTeacherId || ""}
                        onChange={(e) => setFormData({ ...formData, programmingTeacherId: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.specialization || t.title})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-white text-slate-500 font-black border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm"
                  >
                   Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<"teacher" | "mis" | null>(null);

  // Data States
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  const [syllabus, setSyllabus] = useState<FileData | null>(null);
  const [calendarFile, setCalendarFile] = useState<FileData | null>(null);
  const [gradingSheet, setGradingSheet] = useState<FileData | null>(null);
  const [pretestScores, setPretestScores] = useState<FileData | null>(null);
  
  // UI States
  const [activeView, setActiveView] = useState<"dashboard" | "calendar" | "path" | "activities" | "performance" | "quiz" | "alerts" | "students" | "plans" | "monitoring" | "feedback" | "resources" | "teachers" | "sections">("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Result States
  const [plan, setPlan] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [planFeedback, setPlanFeedback] = useState<"up" | "down" | null>(null);
  const [semesterDates, setSemesterDates] = useState<{ start: string; end: string }>({
    start: format(new Date(), "yyyy-MM-dd"),
    end: format(addDays(new Date(), 120), "yyyy-MM-dd")
  });
  const [currentQuiz, setCurrentQuiz] = useState<Activity | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  
  // Chat States
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; messages: { role: "user" | "model"; content: string }[] }[]>([]);
  const [isTweaking, setIsTweaking] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        // Fetch profile from Firestore
        const path = `users/${user.uid}`;
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile(data);
            if (data.role === 'mis' || data.role === 'teacher') {
              setAdminRole(data.role);
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      } else {
        setUser(user);
        setUserProfile(null);
        setAdminRole(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // MIS Data Listeners
  useEffect(() => {
    if (!adminRole) return;

    const unsubTeachers = onSnapshot(collection(db, "teachers"), (snapshot) => {
      setTeachers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "teachers"));

    const unsubStudents = onSnapshot(collection(db, "students"), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "students"));

    const unsubSections = onSnapshot(collection(db, "sections"), (snapshot) => {
      setSections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "sections"));

    return () => {
      unsubTeachers();
      unsubStudents();
      unsubSections();
    };
  }, [adminRole]);

  const handleLogout = async () => {
    try {
      if (adminRole) {
        setAdminRole(null);
      } else {
        await signOut(auth);
      }
      setActiveView("dashboard");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const addNotification = (title: string, message: string, type: "info" | "success" | "warning" = "info") => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      time: new Date(),
      read: false,
      type
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Notification checker for upcoming events
  useEffect(() => {
    const checkUpcoming = () => {
      const now = new Date();
      events.forEach(event => {
        const diff = event.start.getTime() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        
        // Notify if event is in exactly 15 minutes or 5 minutes
        if (minutes === 15 || minutes === 5) {
          const alreadyNotified = notifications.some(n => 
            n.title.includes(event.title) && 
            n.message.includes(`${minutes} minutes`)
          );
          
          if (!alreadyNotified) {
            addNotification(
              "Upcoming Event",
              `"${event.title}" starts in ${minutes} minutes.`,
              "warning"
            );
          }
        }
      });
    };

    const interval = setInterval(checkUpcoming, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [events, notifications]);

  // Mock initial history for the graph
  const initialHistory = [
    { date: "Week 1", score: 0 },
  ];

  const mockScores: ScoreRecord[] = [];

  const cancelGeneration = () => {
    setIsGenerating(false);
    setIsTweaking(false);
    setError(null);
  };

  const handleTweakPlan = async (message: string) => {
    if (!plan) return;
    
    setIsTweaking(true);
    setError(null);
    
    const newUserMessage = { role: "user" as const, content: message };
    setChatMessages(prev => [...prev, newUserMessage]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const prompt = `
        You are an Agentic Study Success System. 
        The student has an existing study plan and wants to tweak it.
        
        EXISTING PLAN:
        ${plan}
        
        STUDENT REQUEST:
        ${message}
        
        TASK:
        - Modify the EXISTING PLAN based on the STUDENT REQUEST.
        - Maintain the same structure and quality.
        - If the request involves changing dates or times, ensure it still fits within the semester: ${semesterDates.start} to ${semesterDates.end}.
        - If the request involves adding or removing topics, refer back to the syllabus if needed: ${syllabus?.content || "N/A"}.
        - Provide the updated plan in Markdown format.
        - ALSO provide the updated JSON block at the end with the list of ALL calendar events (classes and study sessions) in this format:
          [
            {"title": "Class: [Subject Name]", "start": "2026-04-08T08:00:00", "end": "2026-04-08T10:00:00", "type": "class"},
            {"title": "Study: [Topic Name]", "start": "2026-04-08T14:00:00", "end": "2026-04-08T16:00:00", "type": "study"}
          ]
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
      
      if (jsonMatch) {
        const newEvents = JSON.parse(jsonMatch[0]).map((e: any) => ({
          ...e,
          id: Math.random().toString(36).substr(2, 9),
          start: new Date(e.start),
          end: new Date(e.end)
        }));
        setEvents(newEvents);
      }

      const updatedPlan = text.replace(/\[\s*\{.*\}\s*\]/s, "") || "Failed to update plan.";
      setPlan(updatedPlan);
      setChatMessages(prev => [...prev, { role: "model", content: "I've updated your study plan based on your request. You can see the changes in the plan view." }]);
      
      // Update history if it's the first message
      if (chatMessages.length === 0) {
        const newHistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
          messages: [...chatMessages, newUserMessage, { role: "model" as const, content: "I've updated your study plan based on your request." }]
        };
        setChatHistory(prev => [newHistoryItem, ...prev]);
      } else {
        // Update current history item
        setChatHistory(prev => {
          if (prev.length === 0) return prev;
          const last = prev[0];
          return [{ ...last, messages: [...last.messages, newUserMessage, { role: "model" as const, content: "I've updated your study plan based on your request." }] }, ...prev.slice(1)];
        });
      }

    } catch (err: any) {
      setError(err.message || "An error occurred while tweaking the plan.");
      setChatMessages(prev => [...prev, { role: "model", content: "Sorry, I encountered an error while trying to update your plan. Please try again." }]);
    } finally {
      setIsTweaking(false);
    }
  };

  const generateStudyPlan = async () => {
    if (!syllabus || !calendarFile) {
      setError("Please upload at least the Course Outline/Syllabus and Calendar files for the Study Plan.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const feedbackInstruction = planFeedback === "down" 
        ? "\n- NOTE: The previous plan was marked as unsatisfactory by the student. Please try to improve the structure, detail, or alignment with the calendar."
        : "";

      const prompt = `
        You are an Agentic Study Success System for BSIT students.
        ${feedbackInstruction}
        
        INPUT DATA:
        1. COURSE OUTLINE/SYLLABUS: ${syllabus.content}
        2. CALENDAR: ${calendarFile.content}
        3. SEMESTER DURATION: From ${semesterDates.start} to ${semesterDates.end}
        
        TASK:
        - Strictly analyze the provided COURSE OUTLINE/SYLLABUS and CALENDAR. 
        - FIRST, extract all official classes and schedules from the CALENDAR data.
        - SECOND, identify the specific topics and lessons listed in the COURSE OUTLINE/SYLLABUS.
        - THIRD, search the web for credible references (scientific papers, university research) on how long each topic takes to learn/master on average. 
        - DO NOT use open forums like Reddit, Quora, or blogs as references.
        - Adjust the study plan's time allocation and spacing based on these credible findings.
        - Create a "Full Semester Learning Roadmap" that spans from ${semesterDates.start} to ${semesterDates.end}. 
        - The roadmap should be broken down into weeks (e.g., Week 1, Week 2... Week 18), mapping specific topics from the syllabus to each week.
        - CRITICAL: The study plan MUST be contained within the semester dates: ${semesterDates.start} to ${semesterDates.end}. 
        - It cannot start earlier than ${semesterDates.start} and it cannot end later than ${semesterDates.end}.
        - CRITICAL: Study sessions MUST NOT overlap with the official classes extracted from the CALENDAR.
        - Prioritize foundational concepts from the document before advanced ones.
        - Include specific coding exercises for each weekly block.
        
        OUTPUT FORMAT:
        - Use clear Markdown headers for each week of the semester.
        - For each topic in the plan, include a sentence like: "According to [Website Name/Source], [Topic] usually takes [Duration] to learn/master. I have allocated and spaced out the learning time according to this."
        - Provide a structured Full Semester Schedule (from Week 1 to the End).
        - ALSO provide a JSON block at the end with a list of ALL calendar events in this format:
          [
            {"title": "Class: [Subject Name]", "day": "Monday", "start": "08:00", "end": "10:00", "type": "class", "isRecurring": true},
            {"title": "Study: [Topic Name]", "day": "Wednesday", "start": "14:00", "end": "16:00", "type": "study", "isRecurring": true},
            {"title": "Deadline/Exam: [Title]", "start": "2026-06-15T09:00:00", "end": "2026-06-15T12:00:00", "type": "exam", "isRecurring": false}
          ]
        - For "isRecurring": true, the "start" and "end" fields should be just the TIME (HH:MM).
        - For "isRecurring": false, the "start" and "end" fields should be full ISO date-time strings.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
      
      if (jsonMatch) {
        const rawEvents = JSON.parse(jsonMatch[0]);
        const semesterStart = new Date(semesterDates.start);
        const semesterEnd = new Date(semesterDates.end);
        const expandedEvents: any[] = [];

        rawEvents.forEach((e: any) => {
          if (e.isRecurring) {
            // Expand recurring event weekly
            const dayMap: { [key: string]: number } = {
              "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6
            };
            const targetDay = dayMap[e.day];
            if (targetDay === undefined) return;

            let current = new Date(semesterStart);
            while (current <= semesterEnd) {
              if (current.getDay() === targetDay) {
                const eventStart = new Date(current);
                const [startH, startM] = e.start.split(':').map(Number);
                eventStart.setHours(startH, startM, 0, 0);

                const eventEnd = new Date(current);
                const [endH, endM] = e.end.split(':').map(Number);
                eventEnd.setHours(endH, endM, 0, 0);

                if (eventStart >= semesterStart && eventStart <= semesterEnd) {
                  expandedEvents.push({
                    title: e.title,
                    type: e.type,
                    id: Math.random().toString(36).substr(2, 9),
                    start: eventStart,
                    end: eventEnd
                  });
                }
              }
              current.setDate(current.getDate() + 1);
            }
          } else {
            // One-time event
            expandedEvents.push({
              ...e,
              id: Math.random().toString(36).substr(2, 9),
              start: new Date(e.start),
              end: new Date(e.end)
            });
          }
        });

        // Replace all events with the newly synced and generated ones
        setEvents(expandedEvents);
        addNotification(
          "Calendar Synced",
          `Your schedule has been plotted from ${semesterDates.start} to ${semesterDates.end}.`,
          "success"
        );
      }

      setPlan(text.replace(/\[\s*\{.*\}\s*\]/s, "") || "Failed to generate plan.");
      setActiveView("path");
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateActivitiesAndPerformance = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const prompt = `
        Analyze this BSIT student's data for "Programming Languages" course:
        
        STUDENT PROFILE:
        - Level: Beginner
        - Pre-test Score: 40/100
        - Professor: Ms. Esther Reyes
        
        ACADEMIC RECORDS (Activity Scores):
        1. Lab Exercise I (Introduction): 45/50
        2. Lab Exercise I (Syntax & Semantics): 40/40
        3. Performance Task I (Syntax & Semantics): 50/60
        4. Lab Exercise 1 (Lexical & Syntax Analysis): 50/80
        5. Lab Exercise 2 (Lexical & Syntax Analysis): 100/100
        6. Performance Task 1 (Names, Bindings, and Scopes): 80/80
        
        COURSE CONTEXT (SYLLABUS): ${syllabus?.content || "Programming Languages and Paradigms"}
        
        TASKS:
        1. Identify Weak Topics (areas with lowest percentage scores, e.g., Lexical/Syntax Analysis) and Strong Topics (perfect or high percentage scores).
        2. Generate 3 Targeted Remedial Activities for the weakest areas identified.
        3. Each activity MUST include 5 multiple-choice questions (A, B, C, D).
        4. Estimate an "Improvement Percentage" relative to the pre-test (40/100).
        
        OUTPUT FORMAT (JSON):
        {
          "weakTopics": ["topic1", "topic2"],
          "strongTopics": ["topic3", "topic4"],
          "improvementScore": 15,
          "activities": [
            {
              "id": "unique_id",
              "title": "Activity Title",
              "description": "Short description of what this activity covers",
              "questions": [
                {
                  "id": "q1",
                  "text": "Question text?",
                  "options": {
                    "A": "Option A",
                    "B": "Option B",
                    "C": "Option C",
                    "D": "Option D"
                  },
                  "correctAnswer": "A",
                  "explanation": "Why A is correct"
                }
              ]
            }
          ],
          "calendarEvents": [{"title": "Activity: [Topic Name]", "start": "2026-04-18T14:00:00", "end": "2026-04-18T16:00:00", "type": "activity"}]
        }
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
        },
      });

      const data = JSON.parse(response.text);
      
      if (data.calendarEvents) {
        const newEvents = data.calendarEvents.map((e: any) => ({
          ...e,
          id: Math.random().toString(36).substr(2, 9),
          start: new Date(e.start),
          end: new Date(e.end)
        }));
        setEvents(prev => [...prev.filter(ev => ev.type !== "activity"), ...newEvents]);
      }

      setActivities(data.activities || []);
      addNotification(
        "Analysis Complete",
        "Your performance analysis and remedial activities are ready.",
        "success"
      );
      setPerformance({
        weakTopics: data.weakTopics || [],
        strongTopics: data.strongTopics || [],
        improvementScore: data.improvementScore || 15,
        history: [...initialHistory, { date: "Current", score: 75 }],
        scores: mockScores
      });
      setActiveView("activities");
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={40} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user && !adminRole) {
    return <LoginView onLoginSuccess={() => setActiveView("dashboard")} onAdminLogin={(role) => setAdminRole(role)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 z-50 transition-transform duration-300 flex flex-col",
        "md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
              <BrainCircuit className="text-white" size={24} />
            </div>
            <span className="font-black text-xl tracking-tighter text-slate-900">AgentIntelProg</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {adminRole === "teacher" ? (
            <>
              <button 
                onClick={() => {
                  setActiveView("dashboard");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "dashboard" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>
              <button 
                onClick={() => {
                  setActiveView("alerts");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "alerts" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Bell size={18} />
                Alerts
              </button>
              <button 
                onClick={() => {
                  setActiveView("students");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "students" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Users size={18} />
                Student List
              </button>
              <button 
                onClick={() => {
                  setActiveView("plans");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "plans" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Target size={18} />
                Study Plans
              </button>
              <button 
                onClick={() => {
                  setActiveView("monitoring");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "monitoring" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Activity size={18} />
                Performance Monitoring
              </button>
              <button 
                onClick={() => {
                  setActiveView("feedback");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "feedback" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <MessageSquare size={18} />
                Feedback
              </button>
              <button 
                onClick={() => {
                  setActiveView("resources");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "resources" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Library size={18} />
                Resources
              </button>
            </>
          ) : adminRole === "mis" ? (
            <>
              <button 
                onClick={() => {
                  setActiveView("teachers");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "teachers" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <GraduationCap size={18} />
                Manage Teachers
              </button>
              <button 
                onClick={() => {
                  setActiveView("students");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "students" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Users size={18} />
                Manage Students
              </button>
              <button 
                onClick={() => {
                  setActiveView("sections");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "sections" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Library size={18} />
                Class Sections
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => {
                  setActiveView("dashboard");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "dashboard" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>
              <button 
                onClick={() => {
                  setActiveView("calendar");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "calendar" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <CalendarIcon size={18} />
                Calendar
              </button>
              <button 
                onClick={() => {
                  setActiveView("path");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "path" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Target size={18} />
                Study Plan
              </button>
              <button 
                onClick={() => {
                  setActiveView("activities");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "activities" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <ClipboardList size={18} />
                Activities
              </button>
              <button 
                onClick={() => {
                  setActiveView("performance");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  activeView === "performance" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <TrendingUp size={18} />
                Performance
              </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Status</p>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Agent Online
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 flex-1 min-h-screen p-4 sm:p-6 lg:p-10">
        <div className="max-w-7xl mx-auto w-full">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-3 bg-white border border-slate-100 rounded-2xl text-slate-500 hover:text-indigo-600 transition-all flex-shrink-0"
              >
                <Menu size={20} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <span>Overview</span>
                  <ChevronRight size={10} />
                  <span className="text-indigo-600 capitalize">{adminRole === "mis" && activeView === "dashboard" ? "Management" : activeView.replace('mis-', '')}</span>
                </div>
                {!adminRole && (
                  <div className="relative w-full max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search modules..." 
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between md:justify-end gap-4 relative w-full md:w-auto">
              <div className="flex items-center gap-4">
                {!adminRole && (
                  <button 
                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                    className={cn(
                      "p-3 rounded-2xl transition-all relative",
                      isNotificationOpen ? "bg-indigo-600 text-white" : "bg-white border border-slate-100 text-slate-400 hover:text-indigo-600"
                    )}
                  >
                    <Bell size={20} />
                    {notifications.some(n => !n.read) && (
                      <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
                    )}
                  </button>
                )}

                <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900 truncate max-w-[120px]">
                      {user?.email === "MIStest373@gmail.com" ? "John Santos" : (userProfile?.displayName || (adminRole === "teacher" ? "Professor Admin" : adminRole === "mis" ? "John Santos" : (user?.displayName || "Student")))}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      {user?.email === "MIStest373@gmail.com" ? "head MIS admin" : (adminRole === "teacher" ? "Faculty" : adminRole === "mis" ? (userProfile?.position || "head MIS admin") : "BSIT Year 1")}
                    </p>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 hover:bg-rose-100 hover:text-rose-600 transition-all group"
                    title="Sign Out"
                  >
                    <User size={20} className="group-hover:hidden" />
                    <Plus size={20} className="hidden group-hover:block rotate-45" />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isNotificationOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-4 w-80 bg-white rounded-[32px] shadow-2xl border border-slate-100 z-[100] overflow-hidden"
                  >
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-black text-slate-900">Notifications</h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={markAllAsRead}
                          className="text-[10px] font-bold text-indigo-600 hover:underline"
                        >
                          Mark all read
                        </button>
                        <button 
                          onClick={clearNotifications}
                          className="text-[10px] font-bold text-rose-600 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length > 0 ? (
                        <div className="divide-y divide-slate-50">
                          {notifications.map(notif => (
                            <div 
                              key={notif.id} 
                              className={cn(
                                "p-5 transition-colors",
                                !notif.read ? "bg-indigo-50/30" : "hover:bg-slate-50"
                              )}
                            >
                              <div className="flex gap-3">
                                <div className={cn(
                                  "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                  notif.type === "success" ? "bg-emerald-500" : notif.type === "warning" ? "bg-amber-500" : "bg-indigo-500"
                                )} />
                                <div>
                                  <p className="text-xs font-black text-slate-900 mb-1">{notif.title}</p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed mb-2">{notif.message}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                    {format(notif.time, "h:mm a")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-12 text-center">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <Bell size={24} />
                          </div>
                          <p className="text-xs font-bold text-slate-400">No new notifications</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

        {error && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {adminRole === "teacher" && activeView === "dashboard" && (
            <motion.div 
              key="teacher-dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <TeacherDashboard />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "alerts" && (
            <motion.div 
              key="teacher-alerts"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <AlertsView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "students" && (
            <motion.div 
              key="teacher-students"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <StudentListView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "plans" && (
            <motion.div 
              key="teacher-plans"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <StudyPlansView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "monitoring" && (
            <motion.div 
              key="teacher-monitoring"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <PerformanceMonitoringView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "feedback" && (
            <motion.div 
              key="teacher-feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <FeedbackView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "resources" && (
            <motion.div 
              key="teacher-resources"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ResourcesView />
            </motion.div>
          )}

          {adminRole === "mis" && (activeView === "dashboard" || activeView === "teachers" || activeView === "students" || activeView === "sections") && (
            <motion.div 
              key="mis-dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MISDashboard 
                teachers={teachers} 
                students={students} 
                sections={sections} 
                initialTab={activeView === "dashboard" || activeView === "teachers" ? "teachers" : activeView === "students" ? "students" : "sections"}
              />
            </motion.div>
          )}

          {!adminRole && activeView === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DashboardView 
                currentTime={currentTime} 
                onNavigate={setActiveView} 
                performance={performance}
                events={events}
                plan={plan}
                syllabus={syllabus}
                userProfile={userProfile}
              />
            </motion.div>
          )}

          {!adminRole && activeView === "calendar" && (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CalendarView events={events} />
            </motion.div>
          )}

          {!adminRole && activeView === "path" && (
            <motion.div 
              key="path"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <StudyPlanView 
                plan={plan}
                isGenerating={isGenerating}
                error={error}
                onGenerate={generateStudyPlan}
                onCancel={cancelGeneration}
                syllabus={syllabus}
                calendarFile={calendarFile}
                setSyllabus={setSyllabus}
                setCalendarFile={setCalendarFile}
                semesterDates={semesterDates}
                setSemesterDates={setSemesterDates}
                chatMessages={chatMessages}
                chatHistory={chatHistory}
                isTweaking={isTweaking}
                onTweakPlan={handleTweakPlan}
                onSelectHistory={(item: any) => {
                  setChatMessages(item.messages);
                  // Optionally update the plan to the state it was in for that history item
                  // For now, we just restore the conversation
                }}
                onFeedback={(type: any) => {
                  setPlanFeedback(type);
                  addNotification(
                    "Feedback Received",
                    `Thank you! Your feedback helps the AI improve future study plans.`,
                    type === "up" ? "success" : "info"
                  );
                }}
              />
            </motion.div>
          )}

          {!adminRole && activeView === "activities" && (
            <motion.div 
              key="activities"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ActivitiesView 
                activities={activities}
                isGenerating={isGenerating}
                error={error}
                onGenerate={generateActivitiesAndPerformance}
                onCancel={cancelGeneration}
                onStartActivity={(activity: Activity) => {
                  setCurrentQuiz(activity);
                  setActiveView("quiz");
                }}
              />
            </motion.div>
          )}

          {!adminRole && activeView === "quiz" && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {currentQuiz && (
                <QuizView 
                  activity={currentQuiz}
                  onCancel={() => setActiveView("activities")}
                  onComplete={(score, total) => {
                    const result: QuizResult = {
                      id: Math.random().toString(36).substr(2, 9),
                      activityTitle: currentQuiz.title,
                      score,
                      total,
                      date: format(new Date(), "MMM d, yyyy")
                    };
                    setQuizResults(prev => [result, ...prev]);
                    setActiveView("performance");
                    addNotification(
                      "Quiz Completed",
                      `You scored ${score}/${total} on "${currentQuiz.title}". Results recorded in Performance.`,
                      "success"
                    );
                  }}
                />
              )}
            </motion.div>
          )}

          {!adminRole && activeView === "performance" && (
            <motion.div 
              key="performance"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <PerformanceView 
                performance={performance}
                initialHistory={initialHistory}
                mockScores={mockScores}
                quizResults={quizResults}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  </div>
  );
}
