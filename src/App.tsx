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
  sendPasswordResetEmail,
  User as FirebaseUser 
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
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
  Send,
  Library,
  ClipboardCheck,
  Plus,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  RefreshCcw,
  Info,
  Menu,
  MoreVertical,
  Pen,
  Trash2,
  X,
  PlayCircle,
  ExternalLink,
  Check,
  Settings as SettingsIcon,
  LogOut,
  ArrowUpRight,
  ChevronUp,
  Award,
  Star,
  ArrowUp,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Group,
  UserCheck
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

const LoginView = ({ onLoginSuccess, onAdminLogin, addNotification }: { onLoginSuccess: () => void, onAdminLogin: (role: "teacher" | "mis") => void, addNotification: (title: string, message: string, type: "success" | "info" | "warning") => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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
  const [adminRememberMe, setAdminRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remembered_email");
    const savedAdminEmail = localStorage.getItem("remembered_admin_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
    if (savedAdminEmail) {
      setAdminEmail(savedAdminEmail);
      setAdminRememberMe(true);
    }
  }, []);

  const handleForgotPassword = async () => {
    const targetEmail = activePortal === "admin" ? adminEmail : email;
    if (!targetEmail) {
      setError("Please enter your email address first.");
      addNotification("Error", "Please enter your email address first.", "warning");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      addNotification("Reset Link Sent", `A password reset link has been sent to ${targetEmail}. Please check your inbox.`, "success");
    } catch (err: any) {
      setError(err.message);
      addNotification("Error", "Could not send reset link. Please verify the email address.", "warning");
    } finally {
      setLoading(false);
    }
  };

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
            await updateProfile(user, { displayName: "Student Profile" });
            await setDoc(doc(db, "users", user.uid), {
              uid: user.uid,
              email: user.email,
              firstName: "Student",
              lastName: "Profile",
              displayName: "Student Profile",
              role: "student",
              createdAt: new Date().toISOString()
            });
          } else {
            throw signInErr;
          }
        }
      }

      if (rememberMe) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
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
      
      if (adminRememberMe) {
        localStorage.setItem("remembered_admin_email", adminEmail);
      } else {
        localStorage.removeItem("remembered_admin_email");
      }
      
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto py-12">
      <div className={cn(
        "max-w-6xl w-full grid gap-4 md:gap-8 transition-all duration-500",
        activePortal ? "grid-cols-1 max-w-md" : "grid-cols-1 lg:grid-cols-2"
      )}>
        {/* Student Login Container */}
        {(activePortal === null || activePortal === "student") && (
          <motion.div 
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-[32px] md:rounded-[40px] p-6 sm:p-10 shadow-2xl border border-slate-100 flex flex-col"
          >
            {activePortal === null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 md:space-y-6 py-8 md:py-12">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-50 rounded-2xl md:rounded-3xl flex items-center justify-center text-indigo-600">
                  <BrainCircuit size={40} />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900">Student Login</h2>
                  <p className="text-slate-500 text-xs md:text-sm mt-2 px-4">Access your AI-powered study companion</p>
                </div>
                <button 
                  onClick={() => setActivePortal("student")}
                  className="w-full sm:w-auto px-6 py-3.5 md:px-8 md:py-4 bg-indigo-600 text-white font-black rounded-xl md:rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  Enter Student Portal
                  <ChevronRight size={20} />
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-6 md:mb-10">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 text-white shadow-xl shadow-indigo-100">
                    <BrainCircuit size={32} />
                  </div>
                  <h1 className="text-xl md:text-2xl font-black text-slate-900">Student Login</h1>
                  <p className="text-slate-500 text-xs md:text-sm mt-2 px-4">Access your AI-powered study companion</p>
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

                  {!isRegistering && (
                    <div className="flex items-center justify-between px-1">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500/20 transition-all cursor-pointer" 
                        />
                        <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600 transition-colors">Remember me</span>
                      </label>
                      <button 
                        type="button" 
                        onClick={handleForgotPassword}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-all"
                      >
                        Forgot password?
                      </button>
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

                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={adminRememberMe}
                        onChange={(e) => setAdminRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-200 text-slate-900 focus:ring-slate-500/20 transition-all cursor-pointer" 
                      />
                      <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600 transition-colors">Remember me</span>
                    </label>
                    <button 
                      type="button" 
                      onClick={handleForgotPassword}
                      className="text-xs font-bold text-slate-900 hover:underline transition-all"
                    >
                      Forgot password?
                    </button>
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
  userProfile
}: { 
  currentTime: Date; 
  onNavigate: (view: any) => void; 
  performance: PerformanceData | null;
  events: CalendarEvent[];
  plan: string | null;
  userProfile: any;
}) => {
  const todayEvents = events.filter(e => isSameDay(e.start, currentTime));
  const upcomingStudy = events
    .filter(e => e.type === "study" && e.start >= currentTime)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  
  const firstName = userProfile?.firstName || "Student";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
      <div className="lg:col-span-2 space-y-6 md:space-y-8">
        {/* Welcome Card */}
        <div className="bg-white p-6 sm:p-8 md:p-10 rounded-[28px] md:rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group hover:border-indigo-100 transition-all">
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full mb-4 uppercase tracking-wider">
              {firstName}'s Workspace
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 leading-tight">
              Good {format(currentTime, "H") < "12" ? "morning" : format(currentTime, "H") < "18" ? "afternoon" : "evening"}, {firstName}
            </h2>
            <p className="text-slate-500 text-xs md:text-sm max-w-md mb-6 md:mb-8 leading-relaxed">
              Review your progress and continue your tasks with your personalized study plan.
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
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-50/50 to-transparent pointer-events-none hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity" />
          <BrainCircuit className="absolute -bottom-12 -right-12 text-slate-50 rotate-12 group-hover:text-indigo-50 transition-colors" size={200} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
          {/* Progress Summary */}
          <div className="bg-white p-6 md:p-8 rounded-[28px] md:rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-base md:text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
              <Activity size={20} className="text-indigo-500" />
              Progress Summary
            </h3>
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

const CalendarView = ({ 
  events, 
  calendarFile, 
  setCalendarFile 
}: { 
  events: CalendarEvent[];
  calendarFile: FileData | null;
  setCalendarFile: (file: FileData | null) => void;
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

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
        setCalendarFile({ content: fullText, name: selectedFile.name, type: "calendar" });
      } else if (fileName.endsWith(".docx")) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setCalendarFile({ content: result.value, name: selectedFile.name, type: "calendar" });
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setCalendarFile({ content: ev.target?.result as string, name: selectedFile.name, type: "calendar" });
        };
        reader.readAsText(selectedFile);
      }
    } catch (err) {
      console.error("Error processing file:", err);
    }
  };

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">{format(currentMonth, "MMMM yyyy")}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Plan & Classes Overview</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400 hover:text-indigo-600"><ChevronLeft size={20} /></button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400 hover:text-indigo-600"><ChevronRight size={20} /></button>
          </div>

          <div className="h-8 w-px bg-slate-100 mx-2 hidden sm:block" />

          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.docx,.txt,.md"
            onChange={handleFileChange}
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
              calendarFile 
                ? "bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100" 
                : "bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95"
            )}
          >
            {calendarFile ? (
              <>
                <Check size={16} />
                Calendar Uploaded
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Calendar
              </>
            )}
          </button>
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
  onFeedback,
  semesterDates,
  setSemesterDates,
  chatMessages,
  chatHistory,
  isTweaking,
  onTweakPlan,
  onSelectHistory,
  userProfile,
  uploadedFiles
}: any) => {
  const [userFeedback, setUserFeedback] = useState<"up" | "down" | null>(null);
  const [chatInput, setChatInput] = useState("");
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
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:gap-6">
        <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight">Study Plan</h1>
        
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 md:gap-6">
          <div className="space-y-1 md:space-y-2 flex-1 sm:flex-none">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Prepared By:</p>
            <div className="px-4 py-2.5 md:px-6 md:py-3 bg-white border border-slate-100 rounded-2xl shadow-sm min-w-0 sm:min-w-[200px]">
              <span className="text-xs md:text-sm font-bold text-slate-900 truncate block">Professor Name</span>
            </div>
          </div>
          <div className="space-y-1 md:space-y-2 flex-1 sm:flex-none">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Current Level:</p>
            <div className="px-4 py-2.5 md:px-6 md:py-3 bg-white border border-slate-100 rounded-2xl shadow-sm min-w-0 sm:min-w-[200px]">
              <span className="text-xs md:text-sm font-bold text-slate-900">Beginner</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Plan Area */}
        <div className="xl:col-span-2 flex flex-col gap-6 order-2 xl:order-1">
          {/* Plan Display Area */}
          <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px] md:min-h-[600px]">
            <div className="p-5 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50">
              <h2 className="text-lg md:text-xl font-bold text-slate-900">Study Plan for Level</h2>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <button 
                  className="whitespace-nowrap px-4 py-2 md:px-6 md:py-2 border-2 border-slate-900 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95"
                >
                  Request Approval
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 sm:p-8 md:p-12 prose prose-slate prose-sm md:prose-base max-w-none overflow-y-auto max-h-[800px] md:max-h-[1000px] custom-scrollbar">
              <AnimatePresence mode="wait">
                {plan ? (
                  <motion.div
                    key={plan}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <ReactMarkdown>{plan}</ReactMarkdown>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                      <Target size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No Study Plan Generated</h3>
                    <p className="text-xs text-slate-400 mt-2">Your personalized study plan will appear here once approved.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Chatbot Interface */}
        <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm flex flex-col h-[500px] md:h-[700px] overflow-hidden order-1 xl:order-2">
          <div className="p-4 md:p-6 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center">
                <MessageSquare size={18} />
              </div>
              <h3 className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-widest">Agent Intelligence Assistant</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 rounded-[32px]">
                <button 
                  onClick={() => onTweakPlan("Who are you?")}
                  className="text-slate-400 text-sm font-black hover:text-indigo-600 transition-all active:scale-95 group flex items-center gap-2 uppercase tracking-widest cursor-pointer underline decoration-dotted underline-offset-4"
                >
                  <Sparkles size={16} className="text-indigo-200 group-hover:text-indigo-500 transition-colors" />
                  <span>Who am I?</span>
                </button>
              </div>
            ) : (
              chatMessages.map((msg: any, i: number) => (
                <div key={i} className={cn(
                  "flex flex-col gap-2 max-w-[85%]",
                  msg.role === "user" ? "ml-auto" : "mr-auto"
                )}>
                  <div className={cn(
                    "p-4 text-xs leading-relaxed transition-all shadow-sm",
                    msg.role === "user" 
                      ? "bg-slate-900 text-white font-medium rounded-2xl rounded-tr-none" 
                      : "bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none"
                  )}>
                    {msg.role === "model" && (
                      <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <div className="w-1 h-1 bg-indigo-600 rounded-full" /> Agent Intelligence Assistant
                      </p>
                    )}
                    {msg.content}
                  </div>
                  {msg.role === "model" && (
                    <div className="flex items-center gap-3 mt-1 ml-1">
                      <button 
                        onClick={() => handleFeedback("up")}
                        className={cn("text-slate-400 hover:text-indigo-600 transition-colors", userFeedback === "up" && "text-indigo-600")}
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button 
                        onClick={() => handleFeedback("down")}
                        className={cn("text-slate-400 hover:text-rose-600 transition-colors", userFeedback === "down" && "text-rose-600")}
                      >
                        <ThumbsDown size={14} />
                      </button>
                      <button className="text-slate-400 hover:text-indigo-600 transition-colors" onClick={onGenerate}>
                        <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                      </button>
                      <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {isTweaking && (
              <div className="flex items-start">
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 border-t border-slate-50">
            <div className="flex items-center justify-between mb-4">
              <button 
                onClick={() => chatHistory.length > 0 && onSelectHistory(chatHistory[0])}
                className="px-4 py-1.5 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest rounded-full hover:bg-slate-100 transition-all"
              >
                Restore
              </button>
            </div>
            <form onSubmit={handleChatSubmit} className="relative group">
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Enter prompt here..."
                disabled={isTweaking}
                className="w-full pl-6 pr-14 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 shadow-sm"
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isTweaking}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50"
              >
                <ArrowUp size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const MISView = ({ userProfile, activeTab, setActiveTab, addNotification }: { userProfile: any, activeTab: any, setActiveTab: any, addNotification: any }) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ table: string, id: any } | null>(null);
  const [dependencyWarning, setDependencyWarning] = useState<string | null>(null);

  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classUsers, setClassUsers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Function to sync a single user to Auth
  const syncUserToAuth = async (user: any) => {
    const finalEmail = user.email || `${user.lastName.toLowerCase()}.${user.id}@gmail.com`;
    // We use a default password for sync if not explicitly known/set
    const defaultPassword = user.password && user.password !== "*****" ? user.password : "ChangeMe123!";

    try {
      const authRes = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: finalEmail,
          password: defaultPassword,
          displayName: `${user.firstName} ${user.lastName}`,
          role: user.role
        })
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.error || "Auth creation failed");
      
      // Update Firestore with the UID if it wasn't there
      if (!user.uid || user.uid !== authData.uid) {
        await updateDoc(doc(db, "institutionUsers", user.id.toString()), {
          uid: authData.uid,
          email: finalEmail // Ensure email is in sync
        });
      }
      return authData.uid;
    } catch (err: any) {
      console.error(`Sync failed for ${user.id}:`, err);
      return null;
    }
  };

  const syncAllUsers = async () => {
    setIsSyncing(true);
    let successCount = 0;
    try {
      for (const u of users) {
        const finalEmail = u.email || `${u.lastName.toLowerCase()}.${u.id}@gmail.com`;
        const defaultPassword = u.password && u.password !== "*****" ? u.password : "ChangeMe123!";

        const authRes = await fetch("/api/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: finalEmail,
            password: defaultPassword,
            displayName: `${u.firstName} ${u.lastName}`,
            role: u.role
          })
        });
        
        const authData = await authRes.json();
        
        if (!authRes.ok) {
          if (authData.error?.includes("identitytoolkit.googleapis.com")) {
            throw new Error(authData.error); // Stop sync if API is disabled
          }
          console.error(`Sync failed for ${u.id}:`, authData.error);
          continue; // Continue with next user for non-critical errors
        }

        if (!u.uid || u.uid !== authData.uid) {
          await updateDoc(doc(db, "institutionUsers", u.id.toString()), {
            uid: authData.uid,
            email: finalEmail
          });
        }
        successCount++;
      }
      addNotification?.("Auth Sync Complete", `Successfully synced ${successCount} users to Firebase Auth.`, "success");
    } catch (err: any) {
      console.error("Bulk sync interrupted:", err);
      addNotification?.("Auth Sync Error", err.message, "warning");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Seed pre-existing users if they don't exist
    const seedUsers = async () => {
      const teacherEmail = "estherreyes012@gmail.com";
      // Check if teacher exists
      const teacherFound = users.find(u => u.email === teacherEmail);
      if (!teacherFound && users.length > 0) {
        const idNum = parseInt("4" + Math.random().toString().slice(2, 8));
        const idStr = idNum.toString();
        const teacherData = {
          id: idNum,
          lastName: "Reyes",
          firstName: "Esther",
          middleName: "",
          email: teacherEmail,
          password: "ChangeMe123!",
          role: "Teacher"
        };
        try {
          await setDoc(doc(db, "institutionUsers", idStr), teacherData);
          await syncUserToAuth(teacherData);
        } catch (e) {
          console.error("Seed teacher failed", e);
        }
      }

      // Check if John Santos exists
      const misFound = users.find(u => u.lastName === "Santos" && u.firstName === "John");
      if (!misFound && users.length > 0) {
        const idNum = parseInt("2" + Math.random().toString().slice(2, 8));
        const idStr = idNum.toString();
        const misData = {
          id: idNum,
          lastName: "Santos",
          firstName: "John",
          middleName: "",
          email: `santos.${idStr}@gmail.com`,
          password: "ChangeMe123!",
          role: "MIS"
        };
        try {
          await setDoc(doc(db, "institutionUsers", idStr), misData);
          await syncUserToAuth(misData);
        } catch (e) {
          console.error("Seed MIS failed", e);
        }
      }
    };

    if (users.length > 0) {
      seedUsers();
    }
  }, [users]);

  useEffect(() => {
    const unsubYears = onSnapshot(collection(db, "academicYears"), 
      (snap) => setAcademicYears(snap.docs.map(d => {
        const data = d.data();
        return { ...data, id: data.id || d.id };
      })),
      (err) => handleFirestoreError(err, OperationType.LIST, "academicYears")
    );
    const unsubSemesters = onSnapshot(collection(db, "semesters"), 
      (snap) => setSemesters(snap.docs.map(d => {
        const data = d.data();
        return { ...data, id: data.id || d.id };
      })),
      (err) => handleFirestoreError(err, OperationType.LIST, "semesters")
    );
    const unsubUsers = onSnapshot(collection(db, "institutionUsers"), 
      (snap) => {
        const allUsers = snap.docs.map(d => {
          const data = d.data();
          return { ...data, id: data.id || d.id };
        });
        setUsers(allUsers);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "institutionUsers")
    );
    const unsubSections = onSnapshot(collection(db, "sections"), 
      (snap) => setSections(snap.docs.map(d => {
        const data = d.data();
        return { ...data, id: data.id || d.id };
      })),
      (err) => handleFirestoreError(err, OperationType.LIST, "sections")
    );
    const unsubClasses = onSnapshot(collection(db, "classes"), 
      (snap) => setClasses(snap.docs.map(d => {
        const data = d.data();
        return { ...data, id: data.id || d.id };
      })),
      (err) => handleFirestoreError(err, OperationType.LIST, "classes")
    );
    const unsubClassUsers = onSnapshot(collection(db, "classUsers"), 
      (snap) => setClassUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, "classUsers")
    );

    return () => {
      unsubYears();
      unsubSemesters();
      unsubUsers();
      unsubSections();
      unsubClasses();
      unsubClassUsers();
    };
  }, []);

  const handleDelete = (table: string, id: any) => {
    const docId = typeof id === "object" ? id.id : id;
    const numId = Number(docId);
    let warning = null;

    if (table === "academicYear") {
      const count = classes.filter(c => Number(c.academicYearId) === numId).length;
      if (count > 0) warning = `Used by ${count} Classes.`;
    } else if (table === "semester") {
      const count = classes.filter(c => Number(c.semesterId) === numId).length;
      if (count > 0) warning = `Used by ${count} Classes.`;
    } else if (table === "user") {
      const classCount = classes.filter(c => Number(c.userId) === numId).length;
      const classUserCount = classUsers.filter(cu => Number(cu.userId) === numId).length;
      if (classCount > 0 || classUserCount > 0) {
        warning = `Used by ${classCount} Classes and ${classUserCount} Class Student links.`;
      }
    } else if (table === "section") {
      const count = classes.filter(c => Number(c.sectionId) === numId).length;
      if (count > 0) warning = `Used by ${count} Classes.`;
    } else if (table === "class") {
      const count = classUsers.filter(cu => Number(cu.classId) === numId).length;
      if (count > 0) warning = `Used by ${count} enrolled Students.`;
    }

    setDependencyWarning(warning);
    setItemToDelete({ table, id });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const { table, id } = itemToDelete;
    
    let path = "";
    const docId = typeof id === "object" ? id.id : id;

    if (table === "academicYear") path = "academicYears";
    else if (table === "semester") path = "semesters";
    else if (table === "user") path = "institutionUsers";
    else if (table === "section") path = "sections";
    else if (table === "class") path = "classes";
    else if (table === "classUser") path = "classUsers";

    if (path && docId != null) {
      const stringId = docId.toString();
      
      // If deleting a user, also delete from Firebase Auth
      if (table === "user") {
        const userToDelete = users.find(u => u.id.toString() === stringId);
        if (userToDelete?.uid) {
          try {
            await fetch(`/api/delete-user/${userToDelete.uid}`, { method: "DELETE" });
            addNotification?.("Auth Sync", "User deleted from Firebase Authentication.", "success");
          } catch (authErr) {
            console.error("Auth delete error:", authErr);
          }
        }
      }

      try {
        await deleteDoc(doc(db, path, stringId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${path}/${stringId}`);
      }
    }

    setIsDeleteModalOpen(false);
    setItemToDelete(null);
    setDependencyWarning(null);
  };

  const [academicYearId, setAcademicYearId] = useState("");
  const [academicYearDate, setAcademicYearDate] = useState("");
  const [semesterHalf, setSemesterHalf] = useState("");
  const [userLastName, setUserLastName] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userMiddleName, setUserMiddleName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("Student");
  const [sectionId, setSectionId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [className, setClassName] = useState("");

  // Separate states for Class Form to avoid conflicts
  const [classYearId, setClassYearId] = useState("");
  const [classSemId, setClassSemId] = useState("");
  const [classSectionId, setClassSectionId] = useState("");
  const [classTeacherId, setClassTeacherId] = useState("");
  const [classStudentId, setClassStudentId] = useState(""); // for ClassUser
  const [classLinkId, setClassLinkId] = useState(""); // for ClassUser

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const resetForm = () => {
    setAcademicYearId("");
    setAcademicYearDate("");
    setSemesterHalf("");
    setUserLastName("");
    setUserFirstName("");
    setUserMiddleName("");
    setUserEmail("");
    setUserRole("Student");
    setSectionName("");
    setClassName("");
    setClassYearId("");
    setClassSemId("");
    setClassSectionId("");
    setClassTeacherId("");
    setClassStudentId("");
    setClassLinkId("");
    setEditingItem(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsEditModalOpen(true);
  };

  const handleEdit = (table: string, item: any) => {
    setEditingItem({ table, item });
    if (table === "academicYear") {
      setAcademicYearId(item.id);
      setAcademicYearDate(item.date);
    } else if (table === "semester") {
      setSemesterHalf(item.half);
    } else if (table === "user") {
      setUserLastName(item.lastName || "");
      setUserFirstName(item.firstName || "");
      setUserMiddleName(item.middleName || "");
      setUserEmail(item.email || "");
      setUserRole(item.role || "Student");
    } else if (table === "section") {
      setSectionId(item.id?.toString() || "");
      setSectionName(item.name || "");
    } else if (table === "class") {
      setClassYearId(item.academicYearId?.toString() || "");
      setClassSemId(item.semesterId?.toString() || "");
      setClassSectionId(item.sectionId?.toString() || "");
      setClassTeacherId(item.userId?.toString() || "");
    } else if (table === "classUser") {
      setClassLinkId(item.classId?.toString() || "");
      setClassStudentId(item.userId?.toString() || "");
    }
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingItem) {
        const { table, item } = editingItem;
        let path = "";
        let data = {};

        if (table === "academicYear") {
          path = "academicYears";
          data = { id: Number(item.id), date: academicYearDate };
        } else if (table === "semester") {
          path = "semesters";
          data = { id: Number(item.id), half: semesterHalf };
        } else if (table === "user") {
          path = "institutionUsers";
          data = { id: Number(item.id), lastName: userLastName, firstName: userFirstName, middleName: userMiddleName, email: userEmail, role: userRole };
          
          if (item.uid) {
            try {
              await fetch(`/api/update-user/${item.uid}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: userEmail,
                  displayName: `${userFirstName} ${userLastName}`
                })
              });
              addNotification?.("Auth Sync", "User updated in Firebase Authentication.", "success");
            } catch (authErr) {
              console.error("Auth update error:", authErr);
            }
          }
        } else if (table === "section") {
          path = "sections";
          data = { id: Number(item.id), name: sectionName };
        } else if (table === "class") {
          path = "classes";
          data = { 
            id: Number(item.id),
            academicYearId: Number(classYearId), 
            semesterId: Number(classSemId), 
            sectionId: Number(classSectionId), 
            userId: Number(classTeacherId) 
          };
        } else if (table === "classUser") {
          path = "classUsers";
          data = { classId: Number(classLinkId), userId: Number(classStudentId) };
        }

        if (path) {
          await updateDoc(doc(db, path, item.id.toString()), data);
        }
      } else {
        let path = "";
        let data: any = {};
        let docId = "";
        let idNum = 0;

        if (activeTab === "academicYear") {
          path = "academicYears";
          idNum = academicYearId ? Number(academicYearId) : Math.floor(100000 + Math.random() * 900000);
          docId = idNum.toString();
          data = { id: idNum, date: academicYearDate };
        } else if (activeTab === "semester") {
          path = "semesters";
          idNum = semesters.length + 1;
          docId = idNum.toString();
          data = { id: idNum, half: semesterHalf };
        } else if (activeTab === "user") {
          path = "institutionUsers";
          const prefix = userRole === "Student" ? "8" : userRole === "Teacher" ? "4" : "2";
          idNum = Number(prefix + Math.random().toString().slice(2, 8));
          docId = idNum.toString();
          
          // Auto-generate email if not provided
          const finalEmail = userEmail || `${userLastName.toLowerCase()}.${docId}@gmail.com`;
          const defaultPassword = "ChangeMe123!"; // Default password
          
          data = { 
            id: idNum, 
            lastName: userLastName, 
            firstName: userFirstName, 
            middleName: userMiddleName, 
            email: finalEmail, 
            password: defaultPassword, 
            role: userRole 
          };

          // SYNC WITH FIREBASE AUTH
          try {
            const authRes = await fetch("/api/create-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: finalEmail,
                password: defaultPassword,
                displayName: `${userFirstName} ${userLastName}`,
                role: userRole
              })
            });
            const authData = await authRes.json();
            if (!authRes.ok) throw new Error(authData.error || "Auth creation failed");
            
            // Add UID to firestore data
            data.uid = authData.uid;
            
            addNotification?.(
              "Account Created", 
              `Login credentials: ${finalEmail} / ${defaultPassword}`, 
              "success"
            );
          } catch (authErr: any) {
            console.error("Auth sync error:", authErr);
            addNotification?.("Sync Error", authErr.message, "warning");
            // We continue saving to Firestore even if Auth fails, so admin can manually create it if needed
          }

        } else if (activeTab === "section") {
          path = "sections";
          idNum = Math.floor(100 + Math.random() * 900);
          docId = idNum.toString();
          data = { id: idNum, name: sectionName };
        } else if (activeTab === "class") {
          path = "classes";
          idNum = Math.floor(1000 + Math.random() * 9000);
          docId = idNum.toString();
          data = { 
            id: idNum, 
            academicYearId: Number(classYearId), 
            semesterId: Number(classSemId), 
            sectionId: Number(classSectionId), 
            userId: Number(classTeacherId) 
          };
        } else if (activeTab === "classUser") {
          path = "classUsers";
          data = { classId: Number(classLinkId), userId: Number(classStudentId) };
          await addDoc(collection(db, path), data);
          setIsEditModalOpen(false);
          resetForm();
          return;
        }

        if (path && docId) {
          await setDoc(doc(db, path, docId), data);
        }
      }
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, null);
    }
    setIsEditModalOpen(false);
    resetForm();
  };

  const menuItems = [
    { id: "dashboard", label: "MIS Dashboard" },
    { id: "academicYear", label: "Academic Year" },
    { id: "semester", label: "Semester" },
    { id: "user", label: "User" },
    { id: "section", label: "Section" },
    { id: "class", label: "Class" },
    { id: "classUser", label: "Class_User" }
  ];

  return (
    <div className="flex h-full min-h-[calc(100vh-200px)] bg-slate-50 rounded-[40px] overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="p-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {menuItems.find(i => i.id === activeTab)?.label}
            </h1>
            {activeTab === "dashboard" && <p className="text-slate-500 font-medium text-sm mt-1">Overview of institutional data components</p>}
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="https://console.firebase.google.com/project/_/auth/users" 
              target="_blank" 
              rel="referrer" 
              className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ExternalLink size={14} />
              MANAGE AUTHENTICATION
            </a>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 pt-0">
          {activeTab === "dashboard" && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: "TEACHERS", value: users.filter(u => u.role === "Teacher").length },
                  { label: "STUDENTS", value: users.filter(u => u.role === "Student").length },
                  { label: "CLASS SECTION", value: sections.length }
                ].map(stat => (
                  <div key={stat.label} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-5xl font-black text-slate-900">{stat.value}</span>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2">{stat.label}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full border-2 border-slate-100" />
                  </div>
                ))}
              </div>

              {/* Detail Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Teachers Card */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-100" />
                    <h3 className="font-black text-slate-900">Teachers</h3>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Teachers Assigned</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Teachers Unassigned</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("user")} className="w-full py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-100">View All</button>
                </div>

                {/* Students Card */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-100" />
                    <h3 className="font-black text-slate-900">Students</h3>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">with Sections</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">without Sections</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("user")} className="w-full py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-100">View All</button>
                </div>

                {/* Sections Card */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-100" />
                    <h3 className="font-black text-slate-900">Sections</h3>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Sections Full</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Sections Incomplete</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Sections Empty</span>
                      <span className="font-black text-slate-900">0</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("section")} className="w-full py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-100">View All</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "academicYear" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Academic Year ID</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Academic Year Date</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {academicYears.map(item => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.id}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.date}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600">
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleDelete("academicYear", item.id)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={18} /></button>
                          <button onClick={() => handleEdit("academicYear", item)} className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex items-center gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
              </div>
            </div>
          )}

          {activeTab === "semester" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden text-center sm:text-left">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Semester ID</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Semester Half</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {semesters.map(item => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.id}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.half}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600">
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleDelete("semester", item.id)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={18} /></button>
                          <button onClick={() => handleEdit("semester", item)} className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex items-center gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
              </div>
            </div>
          )}

          {activeTab === "user" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">User ID</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest text">Last Name</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">First Name</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Middle Name</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest leading-tight">Default<br/>Password</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Role</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(item => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.id}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.lastName}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.firstName}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.middleName}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.email}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.password}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                          item.role === "Student" ? "bg-emerald-50 text-emerald-600" : item.role === "Teacher" ? "bg-indigo-50 text-indigo-600" : "bg-slate-900 text-white"
                        )}>
                          {item.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDelete("user", item.id)} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={16} /></button>
                          <button onClick={() => handleEdit("user", item)} className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex items-center justify-between gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
                <button 
                  onClick={syncAllUsers} 
                  disabled={isSyncing}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-sm",
                    isSyncing 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
                  )}
                >
                  <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
                  {isSyncing ? "SYNCING..." : "SYNC ALL TO FIREBASE AUTH"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "section" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Section ID</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Section Name</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(item => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.id}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">{item.name}</td>
                      <td className="px-8 py-6 text-sm font-medium text-slate-600">
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleDelete("section", item.id)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={18} /></button>
                          <button onClick={() => handleEdit("section", item)} className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex items-center gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
              </div>
            </div>
          )}

          {activeTab === "class" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Class ID</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Academic Year</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Semester</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Section</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs border-r border-slate-100 uppercase tracking-widest">Teacher</th>
                    <th className="px-6 py-4 font-black text-slate-900 text-xs uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(item => {
                    const year = academicYears.find(y => Number(y.id) === Number(item.academicYearId));
                    const sem = semesters.find(s => Number(s.id) === Number(item.semesterId));
                    const section = sections.find(s => Number(s.id) === Number(item.sectionId));
                    const teacher = users.find(u => Number(u.id) === Number(item.userId));
                    
                    return (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{item.id}</td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{year?.date || item.academicYearId}</td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{sem?.half || item.semesterId}</td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{section?.name || item.sectionId}</td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 border-r border-slate-100">{teacher ? `${teacher.firstName} ${teacher.lastName}` : item.userId}</td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete("class", item.id)} className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={16} /></button>
                            <button onClick={() => handleEdit("class", item)} className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-6 flex items-center gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
              </div>
            </div>
          )}

          {activeTab === "classUser" && (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Class</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm border-r border-slate-100">Student</th>
                    <th className="px-8 py-4 font-black text-slate-900 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classUsers.map((item, i) => {
                    const classItem = classes.find(c => Number(c.id) === Number(item.classId));
                    const student = users.find(u => Number(u.id) === Number(item.userId));
                    const section = classItem ? sections.find(s => Number(s.id) === Number(classItem.sectionId)) : null;
                    
                    return (
                      <tr key={`${item.classId}-${item.userId}-${i}`} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">
                          {classItem ? `ID: ${classItem.id} | ${section?.name || 'Loading...'}` : item.classId}
                        </td>
                        <td className="px-8 py-6 text-sm font-medium text-slate-600 border-r border-slate-100">
                          {student ? `${student.firstName} ${student.lastName}` : item.userId}
                        </td>
                        <td className="px-8 py-6 text-sm font-medium text-slate-600">
                          <div className="flex items-center gap-3">
                            <button onClick={() => handleDelete("classUser", item.id)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={18} /></button>
                            <button onClick={() => handleEdit("classUser", item)} className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Pen size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-6 flex items-center gap-4">
                <button onClick={handleAdd} className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all"><Plus size={24} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsDeleteModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 border border-slate-100 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Are you sure?</h2>
              <p className="text-slate-500 font-medium text-sm mt-4 leading-relaxed px-4">
                The record you are trying to delete is related to {itemToDelete?.table} table. This action cannot be undone.
              </p>
              {dependencyWarning && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600 text-xs font-bold flex items-center gap-3 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  Warning: {dependencyWarning}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="py-4 bg-rose-500 text-white font-black rounded-2xl shadow-xl shadow-rose-100 hover:bg-rose-600 transition-all text-xs uppercase tracking-widest"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit/Add Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => { setIsEditModalOpen(false); resetForm(); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 border border-slate-100"
            >
              <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-8">
                {editingItem ? `Edit ${editingItem.table}` : `Add New ${activeTab}`}
              </h2>
              
              <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1">
                {(activeTab === "academicYear" || (editingItem?.table === "academicYear")) && (
                  <>
                    {!editingItem && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">ID (Automatic if blank)</label>
                        <input 
                          type="number" 
                          value={academicYearId} 
                          onChange={(e) => setAcademicYearId(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Date Range</label>
                      <input 
                        type="text" 
                        value={academicYearDate} 
                        onChange={(e) => setAcademicYearDate(e.target.value)}
                        placeholder="e.g. 2023 - 2024"
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                      />
                    </div>
                  </>
                )}

                {(activeTab === "semester" || (editingItem?.table === "semester")) && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Semester Half</label>
                    <input 
                      type="text" 
                      value={semesterHalf} 
                      onChange={(e) => setSemesterHalf(e.target.value)}
                      placeholder="e.g. 1st / 2nd"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                    />
                  </div>
                )}

                {(activeTab === "user" || (editingItem?.table === "user")) && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">First Name</label>
                        <input 
                          type="text" 
                          value={userFirstName} 
                          onChange={(e) => setUserFirstName(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Middle Name</label>
                        <input 
                          type="text" 
                          value={userMiddleName} 
                          onChange={(e) => setUserMiddleName(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Last Name</label>
                      <input 
                        type="text" 
                        value={userLastName} 
                        onChange={(e) => setUserLastName(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                      <input 
                        type="email" 
                        value={userEmail} 
                        onChange={(e) => setUserEmail(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Role</label>
                      <select 
                        value={userRole} 
                        onChange={(e) => setUserRole(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                      >
                        <option value="Student">Student</option>
                        <option value="Teacher">Teacher</option>
                        <option value="MIS">MIS</option>
                      </select>
                    </div>
                  </>
                )}

                {(activeTab === "section" || (editingItem?.table === "section")) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Section Name</label>
                      <input 
                        type="text" 
                        value={sectionName} 
                        onChange={(e) => setSectionName(e.target.value)}
                        placeholder="e.g. BSIT - 1A"
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {(activeTab === "class" || (editingItem?.table === "class")) && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Year</label>
                        <select value={classYearId} onChange={(e) => setClassYearId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                          <option value="">Select Year</option>
                          {academicYears.map(y => <option key={y.id} value={y.id}>{y.date} (ID: {y.id})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Semester</label>
                        <select value={classSemId} onChange={(e) => setClassSemId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                          <option value="">Select Sem</option>
                          {semesters.map(s => <option key={s.id} value={s.id}>{s.half} (ID: {s.id})</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Section</label>
                      <select value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                        <option value="">Select Section</option>
                        {sections.map(sec => <option key={sec.id} value={sec.id}>{sec.name} (ID: {sec.id})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Teacher</label>
                      <select value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                        <option value="">Select Teacher</option>
                        {users.filter(u => u.role === "Teacher").map(u => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName} (ID: {u.id})</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {(activeTab === "classUser" || (editingItem?.table === "classUser")) && (
                  <>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Class</label>
                      <select value={classLinkId} onChange={(e) => setClassLinkId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                        <option value="">Select Class</option>
                        {classes.map(c => {
                          const year = academicYears.find(y => Number(y.id) === Number(c.academicYearId));
                          const section = sections.find(s => Number(s.id) === Number(c.sectionId));
                          return (
                            <option key={c.id} value={c.id}>
                              ID: {c.id} | {year?.date} - {section?.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Student</label>
                      <select value={classStudentId} onChange={(e) => setClassStudentId(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-900 shadow-sm">
                        <option value="">Select Student</option>
                        {users.filter(u => u.role === "Student").map(u => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName} (ID: {u.id})</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-10">
                <button 
                  onClick={() => { setIsEditModalOpen(false); resetForm(); }}
                  className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-100 hover:bg-slate-800 transition-all text-xs uppercase tracking-widest"
                >
                  {editingItem ? 'Save Changes' : 'Add Record'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActivityView = ({ activity, onComplete, onCancel }: any) => {
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
      <div className="max-w-2xl mx-auto py-8 md:py-12 px-4 sm:px-0">
        <div className="bg-white p-8 md:p-12 rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-2xl text-center">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 text-2xl md:text-5xl">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">Quiz Completed!</h2>
          <p className="text-slate-500 text-xs md:text-sm mb-6 md:mb-8 px-4">Great job finishing the {activity.title} activity.</p>
          
          <div className="bg-slate-50 rounded-2xl md:rounded-3xl p-6 md:p-8 mb-6 md:mb-8">
            <div className="text-4xl md:text-5xl font-black text-slate-900 mb-2">{score} / {activity.questions.length}</div>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Your Final Score</p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => onComplete(score, activity.questions.length)}
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl md:rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all text-xs md:text-sm uppercase tracking-widest"
            >
              Finish & Record Score
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 md:py-8 px-4 sm:px-0">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <button onClick={onCancel} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-xs md:text-sm transition-all">
          <ChevronLeft size={18} /> Exit Quiz
        </button>
        <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
          Q {currentQuestionIndex + 1} / {activity.questions.length}
        </div>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-xl">
        <h3 className="text-lg md:text-xl font-black text-slate-900 mb-6 md:mb-8 leading-relaxed">
          {currentQuestion.text}
        </h3>

        <div className="grid grid-cols-1 gap-3 md:gap-4 mb-8 md:mb-10">
          {(["A", "B", "C", "D"] as const).map(option => (
            <button
              key={option}
              onClick={() => handleAnswer(option)}
              className={cn(
                "w-full p-4 md:p-6 rounded-xl md:rounded-2xl border-2 text-left transition-all flex items-center gap-3 md:gap-4 group",
                answers[currentQuestion.id] === option 
                  ? "border-indigo-600 bg-indigo-50/50" 
                  : "border-slate-50/50 hover:border-slate-200 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs md:text-sm transition-all flex-shrink-0",
                answers[currentQuestion.id] === option 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
              )}>
                {option}
              </div>
              <span className={cn(
                "font-bold text-xs md:text-sm leading-tight",
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
          className="w-full py-4 bg-slate-900 text-white font-black rounded-xl md:rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-30 flex items-center justify-center gap-2 uppercase tracking-widest text-xs md:text-sm shadow-xl shadow-slate-100"
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
  const [expandedModules, setExpandedModules] = useState<string[]>(["Module 1"]);

  const toggleModule = (module: string) => {
    setExpandedModules(prev => 
      prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]
    );
  };

  const preTestQuestions = [
    { id: "1", text: "Question 1", subText: "Full Question", correct: true },
    { id: "2", text: "Question 1", subText: "Full Question", correct: false }
  ];

  return (
    <div className="space-y-6 md:space-y-10">
      <div className="flex flex-col gap-1 md:gap-2">
        <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight">Activities</h1>
        <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">Personalized tasks & performance tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* 1. Pre-Test Scores */}
        <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8 flex flex-col min-h-[380px] md:min-h-[440px]">
          <div className="flex items-center gap-3 mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <Star size={18} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900">Pre-Test Scores</h3>
          </div>
          
          <div className="flex-1 flex flex-col">
            <div className="mb-6 md:mb-10 text-center py-4 md:py-6 bg-slate-50/50 rounded-2xl md:rounded-3xl border border-slate-50">
              <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">0 <span className="text-xl md:text-2xl text-slate-300 mx-1">/</span> 0</h1>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Accuracy Rate</p>
            </div>
            
            <div className="space-y-6">
              {preTestQuestions.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-50 rounded-2xl hover:border-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{q.text}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{q.subText}</p>
                  </div>
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full", 
                    q.correct ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Study Plan Activities */}
        <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8 flex flex-col min-h-[380px] md:min-h-[440px]">
          <div className="flex items-center gap-3 mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <ClipboardList size={18} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900">Study Plan</h3>
          </div>

          <div className="space-y-4">
            {/* Module 1 */}
            <div className="space-y-2">
              <button 
                onClick={() => toggleModule("Module 1")}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-2xl transition-all",
                  expandedModules.includes("Module 1") ? "bg-indigo-50/50 text-indigo-600" : "hover:bg-slate-50 text-slate-600"
                )}
              >
                <h4 className="font-bold text-sm">Module 1</h4>
                {expandedModules.includes("Module 1") ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              <AnimatePresence>
                {expandedModules.includes("Module 1") && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-1 px-2 pb-2 overflow-hidden"
                  >
                    <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 group transition-colors">
                      <span className="text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">Coding Exercise 1</span>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600" />
                    </button>
                    <div className="pt-2 mt-2 border-t border-slate-50 space-y-1">
                      <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 group transition-colors">
                        <div className="flex items-center gap-3">
                          <FileText size={14} className="text-slate-400" />
                          <span className="text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">Read Module</span>
                        </div>
                        <Check size={14} className="text-emerald-500" />
                      </button>
                      <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 group transition-colors">
                         <div className="flex items-center gap-3">
                          <ChevronRight size={14} className="text-slate-400" />
                          <span className="text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">Answer Activity</span>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Module 2 */}
            <div className="opacity-40">
              <button 
                disabled
                className="w-full flex items-center justify-between p-4 rounded-2xl text-slate-400 cursor-not-allowed"
              >
                <h4 className="font-bold text-sm">Module 2</h4>
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Quizzes */}
        <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8 flex flex-col min-h-[380px] md:min-h-[440px]">
          <div className="flex items-center gap-3 mb-6 md:mb-10">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <Award size={18} />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900">Quizzes</h3>
          </div>

          <div className="space-y-10">
             <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Current</p>
              <div className="relative pl-5 border-l-2 border-indigo-600 space-y-4 py-1">
                 <div className="flex items-start gap-3">
                   <div className="w-12 h-12 bg-slate-900 text-white rounded-[18px] flex items-center justify-center flex-shrink-0 shadow-lg shadow-slate-200">
                      <Star size={20} />
                   </div>
                   <div className="flex-1 min-w-0">
                     <h5 className="text-sm font-bold text-slate-900 truncate">Quiz #1: Name</h5>
                     <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">00 Items</p>
                   </div>
                 </div>
                 <button 
                  onClick={() => {
                    if (activities && activities[0]) onStartActivity(activities[0]);
                  }}
                  className="w-full py-2.5 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 uppercase tracking-wider"
                 >
                   Start Quiz
                 </button>
              </div>
            </div>

            <div className="space-y-4 opacity-25">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Upcoming</p>
              <div className="pl-5 border-l-2 border-slate-200 space-y-4 py-1">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Star size={16} />
                    </div>
                    <h5 className="text-sm font-bold text-slate-300">Module 2 Quiz</h5>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!activities && !isGenerating && (
        <div className="bg-white p-12 rounded-[32px] border border-slate-100 shadow-sm text-center">
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-4">No Personalized Activities Available</p>
          <button 
            onClick={onGenerate}
            className="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 uppercase tracking-widest"
          >
            Sync Classroom Data
          </button>
        </div>
      )}
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

    {/* Detailed Improvement Graph */}
    <div className="bg-white p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm h-[300px] sm:h-[400px] md:h-[500px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h2 className="text-base md:text-lg font-black flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-600" />
          Performance Over Time
        </h2>
        <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] md:text-xs font-black self-start sm:self-auto">
          +{performance?.improvementScore || 0}% Growth
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

const TeacherDashboard = ({ 
  onNavigate, 
  onSelectSection,
  onSelectRisk
}: { 
  onNavigate?: (view: any) => void,
  onSelectSection?: (section: string) => void,
  onSelectRisk?: (risk: "Low" | "Moderate" | "High" | "All") => void
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    const day = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return { day, monthDay };
  };

  const { day, monthDay } = formatDate(currentTime);
  const sections = ["BSIT - 1A", "BSIT - 1B", "BSIT - 1C"];

  const riskStats = {
    Low: GLOBAL_ALERTS.filter(a => a.risk === "Low").length,
    Moderate: GLOBAL_ALERTS.filter(a => a.risk === "Moderate").length,
    High: GLOBAL_ALERTS.filter(a => a.risk === "High").length,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="mb-6 px-2 sm:px-0">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-1">Teacher Dashboard</h1>
        <p className="text-slate-400 text-xs md:text-sm font-medium">Welcome back to your workspace.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((section) => (
          <motion.div 
            key={section} 
            whileHover={{ y: -2 }}
            onClick={() => {
              onSelectSection?.(section);
              onNavigate?.("students");
            }}
            className="bg-white rounded-[24px] md:rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group"
          >
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-900 mb-0.5">{section}</h3>
              <p className="text-[10px] md:text-sm font-bold text-slate-400 mb-4 uppercase tracking-tighter">Information Technology</p>
              
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl border-2 border-slate-50 flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-50 group-hover:border-indigo-50 transition-all">
                <Users size={20} className="md:size-24 text-slate-300 group-hover:text-indigo-600 transition-colors" />
              </div>
              
              <p className="text-[9px] md:text-[10px] font-black text-indigo-600 uppercase tracking-widest opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                View Student List
              </p>
            </div>
          </motion.div>
        ))}

        <div className="bg-white rounded-[24px] md:rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="text-2xl md:text-3xl font-black text-slate-900 mb-1 tabular-nums">
            {formatTime(currentTime)}
          </div>
          <div className="text-slate-400 font-bold text-xs">
            {day}, {monthDay}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-slate-100 flex items-center justify-center bg-slate-50">
              <Bell size={18} className="text-slate-900" />
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-900">Alert Statistics</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <motion.div 
              whileHover={{ y: -2 }}
              onClick={() => {
                onSelectRisk?.("Low");
                onNavigate?.("alerts");
              }}
              className="p-3 md:p-4 bg-emerald-50/50 rounded-xl md:rounded-2xl border border-emerald-100 cursor-pointer hover:bg-emerald-50 transition-colors group"
            >
              <p className="text-xl md:text-3xl font-black text-emerald-600 mb-0.5 md:mb-1">{riskStats.Low}</p>
              <p className="text-[8px] md:text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Low</p>
            </motion.div>
            <motion.div 
              whileHover={{ y: -2 }}
              onClick={() => {
                onSelectRisk?.("Moderate");
                onNavigate?.("alerts");
              }}
              className="p-3 md:p-4 bg-amber-50/50 rounded-xl md:rounded-2xl border border-amber-100 cursor-pointer hover:bg-amber-50 transition-colors group"
            >
              <p className="text-xl md:text-3xl font-black text-amber-600 mb-0.5 md:mb-1">{riskStats.Moderate}</p>
              <p className="text-[8px] md:text-[10px] font-bold text-amber-700 uppercase tracking-wider">Moderate</p>
            </motion.div>
            <motion.div 
              whileHover={{ y: -2 }}
              onClick={() => {
                onSelectRisk?.("High");
                onNavigate?.("alerts");
              }}
              className="p-3 md:p-4 bg-rose-50/50 rounded-xl md:rounded-2xl border border-rose-100 cursor-pointer hover:bg-rose-50 transition-colors group"
            >
              <p className="text-xl md:text-3xl font-black text-rose-600 mb-0.5 md:mb-1">{riskStats.High}</p>
              <p className="text-[8px] md:text-[10px] font-bold text-rose-700 uppercase tracking-wider">High</p>
            </motion.div>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-slate-100 flex items-center justify-center bg-slate-50">
              <ClipboardCheck size={18} className="text-slate-900" />
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-900">Plan Approval</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="p-3 md:p-4 bg-slate-50/50 rounded-xl md:rounded-2xl border border-slate-100">
              <p className="text-xl md:text-3xl font-black text-slate-400 mb-0.5 md:mb-1">0</p>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center truncate">Approved</p>
            </div>
            <div className="p-3 md:p-4 bg-slate-50/50 rounded-xl md:rounded-2xl border border-slate-100">
              <p className="text-xl md:text-3xl font-black text-slate-400 mb-0.5 md:mb-1">0</p>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center truncate">Rejected</p>
            </div>
            <div className="p-3 md:p-4 bg-slate-50/50 rounded-xl md:rounded-2xl border border-slate-100">
              <p className="text-xl md:text-3xl font-black text-slate-400 mb-0.5 md:mb-1">0</p>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center truncate">Pending</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GLOBAL_ALERTS = [
  { id: 1, student: "Alice Johnson", topic: "Recursion Logic", description: "Consistently failing recursion base case exercises.", risk: "High", section: "BSIT - 1A" },
  { id: 2, student: "Bob Smith", topic: "Array Manipulation", description: "Struggling with multi-dimensional array shifts.", risk: "Moderate", section: "BSIT - 1B" },
  { id: 3, student: "Charlie Brown", topic: "Basic Syntax", description: "Completed all foundation modules with high accuracy.", risk: "Low", section: "BSIT - 1A" },
  { id: 4, student: "Diana Prince", topic: "Loops & Iterations", description: "Stuck on nested loop logic for 3 consecutive days.", risk: "High", section: "BSIT - 1C" },
  { id: 5, student: "Ethan Hunt", topic: "Data Types", description: "Minor confusion between floats and doubles.", risk: "Moderate", section: "BSIT - 1B" },
  { id: 6, student: "Fiona Gallagher", topic: "Function Scoping", description: "Frequent errors with global vs local variables.", risk: "High", section: "BSIT - 1A" },
];

const AlertsView = ({ 
  initialRisk = "All",
  onBack = null
}: { 
  initialRisk?: "Low" | "Moderate" | "High" | "All",
  onBack?: (() => void) | null
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState("All Sections");
  const [riskFilter, setRiskFilter] = useState<"Low" | "Moderate" | "High" | "All">(initialRisk);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  
  useEffect(() => {
    setRiskFilter(initialRisk);
  }, [initialRisk]);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [gradeScore, setGradeScore] = useState("50");
  const [maxScore] = useState("50");
  const [gradeRemarks, setGradeRemarks] = useState("");
  const [feedbacks, setFeedbacks] = useState<Record<number, { subject: string; text: string }>>({});
  const [formSubject, setFormSubject] = useState("");
  const [formText, setFormText] = useState("");

  const filteredAlerts = GLOBAL_ALERTS.filter(a => {
    const matchesSearch = a.student.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         a.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSection = selectedSection === "All Sections" || a.section === selectedSection;
    const matchesRisk = riskFilter === "All" || a.risk === riskFilter;
    return matchesSearch && matchesSection && matchesRisk;
  });

  const handleFeedbackSubmit = () => {
    if (selectedAlert) {
      setFeedbacks(prev => ({
        ...prev,
        [selectedAlert.id]: { subject: formSubject, text: formText }
      }));
      setFormSubject("");
      setFormText("");
      setShowFeedbackModal(false);
    }
  };

  const handleGradeSubmit = () => {
    setShowGradingModal(false);
    setGradeRemarks("");
    // In a real app we'd save this
  };

  if (selectedAlert) {
    const alertFeedback = feedbacks[selectedAlert.id];
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedAlert(null)}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-slate-900"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Take Action</h1>
            <p className="text-slate-500 text-sm font-medium">Assign tasks to students who need intervention</p>
          </div>
        </div>

        <div className="bg-white rounded-[24px] md:rounded-[32px] p-6 md:p-10 border border-slate-100 shadow-sm space-y-8 md:space-y-10">
          {/* Header Info */}
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <User size={32} className="text-slate-300" />
              </div>
              <div className="space-y-2 md:space-y-3">
                <div className={cn(
                  "inline-block px-3 md:px-4 py-1.5 rounded-lg md:rounded-xl font-bold text-base md:text-lg border transition-colors",
                  selectedAlert.risk === "High" ? "bg-rose-100/60 text-rose-700 border-rose-200" : 
                  selectedAlert.risk === "Moderate" ? "bg-amber-100/60 text-amber-700 border-amber-200" : 
                  "bg-emerald-100/60 text-emerald-700 border-emerald-200"
                )}>
                  {selectedAlert.student}
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-900">{selectedAlert.topic}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Description/Reason for Alert</p>
                  <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{selectedAlert.description}</p>
                </div>
              </div>
            </div>

            <div className="md:text-right space-y-3 md:space-y-4">
              <div className="flex items-center md:justify-end gap-3">
                <h3 className="text-lg md:text-xl font-black text-slate-900">Feedback</h3>
                <button 
                  onClick={() => setShowFeedbackModal(true)}
                  className="px-3 py-1.5 bg-white border border-slate-100 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs hover:bg-slate-50 transition-all text-slate-600 shadow-sm"
                >
                  Add Feedback
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400 font-bold text-[9px] md:text-[10px] uppercase tracking-widest">Date {format(new Date(), "MM-dd-yyyy")}</p>
                {alertFeedback ? (
                  <div className="max-w-xs md:ml-auto space-y-1">
                    <p className="text-xs font-black text-slate-900">{alertFeedback.subject}</p>
                    <p className="text-xs md:text-sm text-slate-500 font-medium leading-relaxed italic">
                      "{alertFeedback.text}"
                    </p>
                  </div>
                ) : (
                  <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed max-w-xs md:ml-auto italic">
                    No feedback provided yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Table */}
          <div className="bg-slate-50/30 rounded-2xl border border-slate-100/50 overflow-hidden">
            <div className="overflow-x-auto selection:bg-indigo-100">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                    <th className="px-5 md:px-6 py-4">Status</th>
                    <th className="px-5 md:px-6 py-4">Actions to be Done</th>
                    <th className="px-5 md:px-6 py-4">Start</th>
                    <th className="px-5 md:px-6 py-4">Due</th>
                    <th className="px-5 md:px-6 py-4 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="text-sm font-medium text-slate-600 hover:bg-indigo-50/10 transition-colors">
                    <td className="px-6 py-4">To Be Done</td>
                    <td className="px-6 py-4 font-bold text-slate-900 text-xs">Read Module No. 4</td>
                    <td className="px-6 py-4 text-xs font-bold">May - 12</td>
                    <td className="px-6 py-4 text-xs font-bold">May - 15</td>
                    <td className="px-6 py-4">
                      <div className="w-5 h-5 border border-slate-200 rounded-lg bg-white flex items-center justify-center shadow-sm">
                        <Check size={12} className="text-emerald-500" />
                      </div>
                    </td>
                  </tr>
                  <tr className="text-sm font-medium text-slate-600 hover:bg-indigo-50/10 transition-colors">
                    <td className="px-6 py-4">To Be Done</td>
                    <td className="px-6 py-4 font-bold text-slate-900 text-xs">Answer Activity 4.2</td>
                    <td className="px-6 py-4 text-xs font-bold">May - 13</td>
                    <td className="px-6 py-4 text-xs font-bold">May - 16</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border border-slate-200 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <Check size={12} className="text-emerald-500" />
                        </div>
                        <button 
                          onClick={() => setShowGradingModal(true)}
                          className="p-1 hover:bg-slate-100 rounded-lg transition-colors group/file"
                        >
                          <FileText size={16} className="text-slate-300 group-hover/file:text-indigo-500 transition-colors" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              onClick={() => setSelectedAlert(null)}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              Assign Tasks
            </button>
          </div>
        </div>

        {/* Feedback Modal */}
        <AnimatePresence>
          {showFeedbackModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowFeedbackModal(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-xl bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden"
              >
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                        <User size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900">{selectedAlert.student}</h3>
                        <p className="text-xs font-bold text-slate-400">{selectedAlert.topic}</p>
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                      Date {format(new Date(), "MM-dd-yyyy")}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <input 
                      type="text"
                      placeholder="Feedback Subject"
                      className="w-full px-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                    />
                    <textarea 
                      placeholder="Write feedback..."
                      rows={4}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      onClick={() => setShowFeedbackModal(false)}
                      className="px-6 py-3 bg-white border border-slate-100 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleFeedbackSubmit}
                      className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      Submit Feedback
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Activity Grading Modal */}
        <AnimatePresence>
          {showGradingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGradingModal(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white rounded-[40px] border-2 border-slate-100 shadow-2xl overflow-hidden"
              >
                <div className="p-8 md:p-12">
                  <div className="flex items-center justify-between mb-10">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Activity Grading</h2>
                    <button onClick={() => setShowGradingModal(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                      <X size={24} className="text-slate-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Left Column: Activity Preview */}
                    <div className="flex flex-col gap-4">
                      <label className="text-sm font-black uppercase tracking-widest text-slate-400">Activity Uploaded</label>
                      <div className="flex-1 min-h-[400px] bg-slate-50 border-2 border-slate-100 rounded-[32px] flex items-center justify-center p-8 relative overflow-hidden group/preview">
                        <div className="flex flex-col items-center gap-4 text-center">
                          <div className="w-20 h-20 bg-white border-2 border-slate-100 rounded-3xl flex items-center justify-center shadow-xl shadow-slate-100">
                            <FileText size={40} className="text-slate-200" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-lg font-black text-slate-900">Activity_Submission.pdf</p>
                            <p className="text-sm font-bold text-slate-400">Uploaded on May 13, 2024</p>
                          </div>
                          <button className="mt-4 px-6 py-2.5 bg-white border-2 border-slate-100 rounded-xl font-black text-xs uppercase tracking-widest hover:border-slate-900 transition-all">
                            View Document
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Grading Controls */}
                    <div className="flex flex-col gap-10">
                      <div className="space-y-6">
                        <label className="text-sm font-black uppercase tracking-widest text-slate-400">Score</label>
                        <div className="flex items-center gap-6">
                            <input 
                              type="number" 
                              value={gradeScore}
                              onChange={(e) => {
                                const val = e.target.value;
                                const numVal = parseInt(val);
                                if (val === "" || (!isNaN(numVal) && numVal <= parseInt(maxScore))) {
                                  setGradeScore(val);
                                }
                              }}
                              className="w-[120px] p-4 bg-white border-2 border-slate-900 rounded-2xl text-center text-2xl font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all appearance-none"
                            />
                          <div className="text-4xl font-black text-slate-900">
                             / {maxScore}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-sm font-black uppercase tracking-widest text-slate-400">Remarks</label>
                        <textarea 
                          value={gradeRemarks}
                          onChange={(e) => setGradeRemarks(e.target.value)}
                          placeholder="Add your feedback about the activity here..."
                          className="w-full h-48 p-8 bg-white border-2 border-slate-100 rounded-[32px] text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-slate-900 transition-all resize-none shadow-sm"
                        />
                      </div>

                      <button 
                        onClick={handleGradeSubmit}
                        className="w-full py-5 bg-white border-2 border-slate-900 rounded-[20px] font-black text-sm uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-xl shadow-slate-200/50"
                      >
                        Send Grade and Feedback
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Teacher Alerts</h1>
        <p className="text-slate-500 font-medium">Monitor critical student performance</p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setRiskFilter(riskFilter === "Low" ? "All" : "Low")}>
          <div className={cn(
            "w-6 h-6 rounded-full border border-slate-200 transition-all shadow-sm",
            riskFilter === "Low" ? "bg-emerald-400" : "bg-emerald-100/40"
          )} />
          <span className="text-sm font-bold text-slate-600 transition-colors group-hover:text-slate-900">Low Risk</span>
        </div>
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setRiskFilter(riskFilter === "Moderate" ? "All" : "Moderate")}>
          <div className={cn(
            "w-6 h-6 rounded-full border border-slate-200 transition-all shadow-sm",
            riskFilter === "Moderate" ? "bg-amber-400" : "bg-amber-100/40"
          )} />
          <span className="text-sm font-bold text-slate-600 transition-colors group-hover:text-slate-900">Moderate Risk</span>
        </div>
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setRiskFilter(riskFilter === "High" ? "All" : "High")}>
          <div className={cn(
            "w-6 h-6 rounded-full border border-slate-200 transition-all shadow-sm",
            riskFilter === "High" ? "bg-rose-400" : "bg-rose-100/40"
          )} />
          <span className="text-sm font-bold text-slate-600 transition-colors group-hover:text-slate-900">High Risk</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
          <input 
            type="text"
            placeholder="Search student or topic..."
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <select 
            className="appearance-none pl-6 pr-12 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-600 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer min-w-[200px] shadow-sm"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option>All Sections</option>
            <option>BSIT - 1A</option>
            <option>BSIT - 1B</option>
            <option>BSIT - 1C</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAlerts.map((alert) => (
          <div 
            key={alert.id}
            className={cn(
              "p-6 rounded-3xl border border-slate-100 flex items-center justify-between gap-6 transition-all hover:shadow-md hover:scale-[1.01]",
              alert.risk === "High" ? "bg-rose-100/40" : 
              alert.risk === "Moderate" ? "bg-amber-100/40" : "bg-emerald-100/40"
            )}
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                <User size={24} className={cn(
                  alert.risk === "High" ? "text-rose-500" : 
                  alert.risk === "Moderate" ? "text-amber-500" : "text-emerald-500"
                )} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-tight">{alert.student}</h3>
                <p className="font-bold text-slate-500 text-sm mt-0.5">{alert.topic}</p>
                <p className="text-xs font-medium text-slate-400 leading-tight mt-1">{alert.description}</p>
              </div>
            </div>
            
            <button 
              onClick={() => setSelectedAlert(alert)}
              className="px-5 py-3 bg-white border border-slate-100 rounded-xl font-bold text-xs whitespace-nowrap hover:bg-slate-50 transition-all shadow-sm text-slate-600"
            >
              Take Action
            </button>
          </div>
        ))}
        {filteredAlerts.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
            <p className="text-slate-400 font-bold text-sm">No alerts found matching your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface Student {
  id: string;
  name: string;
  email?: string;
  section: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  gpa: number;
}

const getStudentLevel = (gpa: number): "Beginner" | "Intermediate" | "Advanced" => {
  if (gpa >= 1.0 && gpa <= 1.75) return "Advanced";
  if (gpa >= 2.0 && gpa <= 2.75) return "Intermediate";
  return "Beginner";
};

const GLOBAL_STUDENTS: Student[] = [
  // BSIT - 1A
  { id: "2024-001", name: "Alice Johnson", section: "BSIT - 1A", level: getStudentLevel(3.5), gpa: 3.5 },
  { id: "2024-002", name: "Bob Smith", section: "BSIT - 1A", level: getStudentLevel(2.25), gpa: 2.25 },
  { id: "2024-003", name: "Charlie Brown", section: "BSIT - 1A", level: getStudentLevel(1.5), gpa: 1.5 },
  { id: "2024-004", name: "David Miller", section: "BSIT - 1A", level: getStudentLevel(3.25), gpa: 3.25 },
  { id: "2024-005", name: "Eve Wilson", section: "BSIT - 1A", level: getStudentLevel(2.5), gpa: 2.5 },
  { id: "2024-006", name: "Frank Thomas", section: "BSIT - 1A", level: getStudentLevel(1.25), gpa: 1.25 },
  { id: "2024-007", name: "Grace Lee", section: "BSIT - 1A", level: getStudentLevel(3.1), gpa: 3.1 },
  { id: "2024-008", name: "Henry Davis", section: "BSIT - 1A", level: getStudentLevel(2.0), gpa: 2.0 },
  { id: "2024-009", name: "Ivy Garcia", section: "BSIT - 1A", level: getStudentLevel(1.75), gpa: 1.75 },
  { id: "2024-010", name: "Jack White", section: "BSIT - 1A", level: getStudentLevel(3.0), gpa: 3.0 },
  
  // BSIT - 1B
  { id: "2024-011", name: "Kelly Green", section: "BSIT - 1B", level: getStudentLevel(2.1), gpa: 2.1 },
  { id: "2024-012", name: "Liam Neeson", section: "BSIT - 1B", level: getStudentLevel(1.0), gpa: 1.0 },
  { id: "2024-013", name: "Mia Wong", section: "BSIT - 1B", level: getStudentLevel(3.2), gpa: 3.2 },
  { id: "2024-014", name: "Noah Ark", section: "BSIT - 1B", level: getStudentLevel(2.75), gpa: 2.75 },
  { id: "2024-015", name: "Olivia Pope", section: "BSIT - 1B", level: getStudentLevel(1.1), gpa: 1.1 },
  { id: "2024-016", name: "Peter Parker", section: "BSIT - 1B", level: getStudentLevel(3.4), gpa: 3.4 },
  { id: "2024-017", name: "Quinn Fabray", section: "BSIT - 1B", level: getStudentLevel(2.4), gpa: 2.4 },
  { id: "2024-018", name: "Riley Reid", section: "BSIT - 1B", level: getStudentLevel(1.6), gpa: 1.6 },
  { id: "2024-019", name: "Sam Winchester", section: "BSIT - 1B", level: getStudentLevel(3.1), gpa: 3.1 },
  { id: "2024-020", name: "Tina Fey", section: "BSIT - 1B", level: getStudentLevel(2.3), gpa: 2.3 },

  // BSIT - 1C
  { id: "2024-021", name: "Uma Thurman", section: "BSIT - 1C", level: getStudentLevel(1.4), gpa: 1.4 },
  { id: "2024-022", name: "Victor Hugo", section: "BSIT - 1C", level: getStudentLevel(3.0), gpa: 3.0 },
  { id: "2024-023", name: "Wendy Darling", section: "BSIT - 1C", level: getStudentLevel(2.2), gpa: 2.2 },
  { id: "2024-024", name: "Xander Cage", section: "BSIT - 1C", level: getStudentLevel(1.7), gpa: 1.7 },
  { id: "2024-025", name: "Yara Greyjoy", section: "BSIT - 1C", level: getStudentLevel(3.2), gpa: 3.2 },
  { id: "2024-026", name: "Zane Grey", section: "BSIT - 1C", level: getStudentLevel(2.6), gpa: 2.6 },
  { id: "2024-027", name: "Arthur Dent", section: "BSIT - 1C", level: getStudentLevel(1.2), gpa: 1.2 },
  { id: "2024-028", name: "Bilbo Baggins", section: "BSIT - 1C", level: getStudentLevel(3.1), gpa: 3.1 },
  { id: "2024-029", name: "Catelyn Stark", section: "BSIT - 1C", level: getStudentLevel(2.5), gpa: 2.5 },
  { id: "2024-030", name: "Dobby Elf", section: "BSIT - 1C", level: getStudentLevel(1.3), gpa: 1.3 },
];

const StudentListView = ({ 
  initialSection = null,
  onBack = null,
  onSendPlan = null
}: { 
  initialSection?: string | null,
  onBack?: (() => void) | null,
  onSendPlan?: ((student: Student) => void) | null
}) => {
  const [selectedSection, setSelectedSection] = useState<string | null>(initialSection);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"name" | "level" | "gpa">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedStudentDetails, setSelectedStudentDetails] = useState<Student | null>(null);

  const sections = ["BSIT - 1A", "BSIT - 1B", "BSIT - 1C"];
  
  useEffect(() => {
    setSelectedSection(initialSection);
  }, [initialSection]);
  
  const filteredStudents = GLOBAL_STUDENTS
    .filter(s => !selectedSection || s.section === selectedSection)
    .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm))
    .filter(s => filterLevel === "All" || s.level === filterLevel)
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        const aLast = a.name.split(" ").slice(-1)[0];
        const bLast = b.name.split(" ").slice(-1)[0];
        comparison = aLast.localeCompare(bLast);
        if (comparison === 0) comparison = a.name.localeCompare(b.name);
      }
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
      <div className="bg-white rounded-[24px] md:rounded-[40px] p-6 sm:p-10 border border-slate-100 shadow-sm">
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
              onClick={() => {
                setSelectedSection(null);
                onBack?.();
              }}
              className="px-4 py-2 text-indigo-600 font-bold text-sm hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-2"
            >
              <ChevronLeft size={16} /> Back to Sections
            </button>
          )}
        </div>

        {!selectedSection ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sections.map((section) => {
              const count = GLOBAL_STUDENTS.filter(s => s.section === section).length;
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
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <div className="min-w-[600px] px-5 sm:px-0">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Student</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student ID</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Level</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">GPA</th>
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
                          <td className="py-4 md:py-5 pl-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-100 rounded-lg md:rounded-xl flex items-center justify-center text-indigo-600 font-black text-xs md:text-sm">
                                {student.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-xs md:text-sm font-black text-slate-900 leading-tight">{student.name}</p>
                                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">{student.section}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 md:py-5 text-xs md:text-sm text-slate-500 font-medium">{student.id}</td>
                          <td className="py-4 md:py-5">
                            <span className={cn(
                              "px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase whitespace-nowrap",
                              student.level === "Advanced" ? "bg-indigo-100 text-indigo-600" :
                              student.level === "Intermediate" ? "bg-amber-100 text-amber-600" :
                              "bg-slate-100 text-slate-500"
                            )}>
                              {student.level}
                            </span>
                          </td>
                          <td className="py-4 md:py-5 text-center">
                            <span className="text-xs md:text-sm font-black text-slate-700">{student.gpa.toFixed(2)}</span>
                          </td>
                          <td className="py-4 md:py-5 text-right pr-4">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => setSelectedStudentDetails(student)}
                                className="p-1.5 md:p-2 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-lg"
                              >
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
            {filteredStudents.length === 0 && (
              <div className="py-20 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Search size={32} />
                </div>
                <p className="text-sm font-bold text-slate-400">No students found matching your criteria</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedStudentDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudentDetails(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">
                      <User size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 leading-tight">{selectedStudentDetails.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">ID: {selectedStudentDetails.id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedStudentDetails(null)}
                    className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex items-center justify-between pb-6 border-b border-slate-50">
                  <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Current GPA</span>
                  <span className="text-2xl font-black text-indigo-600">{selectedStudentDetails.gpa.toFixed(2)}</span>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={() => {
                      onSendPlan?.(selectedStudentDetails);
                      setSelectedStudentDetails(null);
                    }}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Sparkles size={16} />
                    Send Study Plan
                  </button>
                </div>

                <div className="space-y-6">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Level History</h4>
                  <div className="space-y-4">
                    {[
                      { term: "Prelims", date: "03-15-2024", level: "Beginner" },
                      { term: "Midterms", date: "05-10-2024", level: "Beginner" },
                      { term: "Finals", date: "07-20-2024", level: "Intermediate" },
                    ].map((h, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{h.term}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{h.date}</p>
                        </div>
                        <div className="px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-[10px] text-slate-600 uppercase tracking-wider">
                          {h.level}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StudyPlansView = ({ 
  recipient = null,
  onClearRecipient = null,
  syllabus,
  calendarFile,
  uploadedFiles,
  semesterDates
}: { 
  recipient?: Student | null,
  onClearRecipient?: () => void,
  syllabus: any,
  calendarFile: any,
  uploadedFiles: any[],
  semesterDates: any
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [approvalSectionFilter, setApprovalSectionFilter] = useState("All");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<"Approved" | "Rejected" | "Pending" | "All">("All");
  const [isPlanSent, setIsPlanSent] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLevel, setGenerationLevel] = useState("");
  const [generatedPlan, setGeneratedPlan] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);

  const handleLevelGenerate = async () => {
    if (!syllabus || !calendarFile) {
      alert("Please ensure Syllabus and Calendar files are uploaded in the main dashboard.");
      return;
    }
    setIsAiThinking(true);
    setGeneratedPlan(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-1.5-flash"; // Use confirmed model alias

      const resourceContext = uploadedFiles.length > 0 
        ? `\nAVAILABLE RESOURCES (from your Resources page): \n${uploadedFiles.map(f => `- ${f.name} (Category: ${f.category}, Type: ${f.type})`).join("\n")}`
        : "";

      const prompt = `
        You are an AI Curriculum Specialist. Generate a "SMART" study plan specifically for students at the "${generationLevel}" level.
        ${resourceContext}

        CONTEXT:
        1. SYLLABUS: ${syllabus.content}
        2. CALENDAR: ${calendarFile.content}
        3. SEMESTER DURATION: ${semesterDates.start} to ${semesterDates.end}

        TASK:
        - Analyze topic difficulty from the syllabus.
        - Map these topics to SPECIFIC DATES between ${semesterDates.start} and ${semesterDates.end}. Use a clear "Date: [Topic]" format.
        - Ensure NO OVERLAP with official classes found in the calendar.
        - REFER TO the available resources listed above where relevant (e.g., "See Module: Introduction to JS for this topic").
        - BREAK DOWN the study plan into small, manageable daily or weekly tasks with specific dates.

        OUTPUT FORMAT:
        1. A comprehensive Markdown-formatted study plan with dates.
        2. AT THE VERY END, provide a JSON array of events for the calendar (format: [{ id: string, title: string, start: ISOString, end: ISOString, type: "study", resourceId: string }]).
        3. For each study session, mention which of the AVAILABLE RESOURCES the student should use.
        4. Provide credible time allocations for each topic based on typical learning curves.
        5. Professional Markdown with specific dates.
      `;

      const result = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      setGeneratedPlan(result.text || "### Error Generating Plan\n\nPlease check your files and try again.");
    } catch (err) {
      console.error(err);
      setGeneratedPlan("### Error Generating Plan\n\nPlease check your files and try again.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleRefinePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiPrompt.trim() || !generatedPlan || isAiThinking) return;
    
    const userMessage = aiPrompt;
    setAiPrompt("");
    setIsAiThinking(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const prompt = `
        You are an AI Curriculum Specialist. Use the existing study plan and the user's request to refine it.
        
        EXISTING PLAN:
        ${generatedPlan}
        
        REFINEMENT REQUEST:
        ${userMessage}
        
        TASK:
        - Update the study plan accordingly.
        - Keep the Markdown date-based structure.
        - Ensure consistency with previous constraints (no conflicts, resource references).
        
        OUTPUT: Updated Markdown study plan.
      `;
      
      const result = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      setGeneratedPlan(result.text || "Updated Markdown study plan.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiThinking(false);
    }
  };

  const [requests, setRequests] = useState<{
    id: number;
    studentName: string;
    section: string;
    date: string;
    status: "Approved" | "Rejected" | "Pending";
    content: string;
  }[]>([
    { id: 1, studentName: "Alice Johnson", section: "BSIT - 1A", date: "May 12, 2024", status: "Pending", content: "Focus on understanding Linked Lists and Binary Trees through visualization tools and practical coding exercises. I plan to dedicate 2 hours daily for practice." },
    { id: 2, studentName: "Bob Smith", section: "BSIT - 1B", date: "May 11, 2024", status: "Pending", content: "Reviewing fundamental Python syntax and moving towards API integration modules over the next 4 weeks using real-world project scenarios." },
    { id: 3, studentName: "Charlie Brown", section: "BSIT - 1A", date: "May 10, 2024", status: "Pending", content: "Advanced algorithms study including Dynamic Programming and Graph theory. Aiming to complete 5 competitive programming challenges per week." },
    { id: 4, studentName: "Diana Prince", section: "BSIT - 1C", date: "May 12, 2024", status: "Pending", content: "Comprehensive base of SQL queries and relational database design. I will build a small inventory management system as final project." },
    { id: 5, studentName: "Ethan Hunt", section: "BSIT - 1B", date: "May 09, 2024", status: "Pending", content: "Introduction to Web Development basics, focusing on semantic HTML and responsive CSS layouts using Flexbox and Grid." },
    { id: 6, studentName: "Fiona Gallagher", section: "BSIT - 1A", date: "May 08, 2024", status: "Pending", content: "Java object-oriented programming principles, inheritance, and polymorphism with weekly coding peer reviews." },
    { id: 7, studentName: "George RR Martin", section: "BSIT - 1C", date: "May 07, 2024", status: "Pending", content: "Mobile app development with React Native, focusing on cross-platform navigation and state management patterns." },
    { id: 8, studentName: "Hideo Kojima", section: "BSIT - 1B", date: "May 06, 2024", status: "Pending", content: "Cybersecurity fundamentals, network scanning, and penetration testing ethically within a sandbox environment." },
  ]);

  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [modalRemarks, setModalRemarks] = useState("");
  const [modalStatus, setModalStatus] = useState<"Approved" | "Rejected" | "Pending">("Pending");
  
  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.studentName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSection = approvalSectionFilter === "All" || req.section === approvalSectionFilter;
    const matchesStatus = approvalStatusFilter === "All" || req.status === approvalStatusFilter;
    return matchesSearch && matchesSection && matchesStatus;
  });

  const handleSend = () => {
    if (!selectedRequest) return;
    
    setRequests(prev => prev.map(req => 
      req.id === selectedRequest.id 
        ? { ...req, status: modalStatus as any } 
        : req
    ));
    
    setSelectedRequest(null);
    setModalRemarks("");
    setModalStatus("Pending");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Study Plans</h1>
        <p className="text-slate-500 font-medium">Release AI-Generated study paths to student levels</p>
      </div>

      {/* Container 1: Release Plans */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm">
        {isPlanSent && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 font-bold text-sm"
          >
            <CheckCircle2 size={20} />
            Study plan has been released successfully to students.
          </motion.div>
        )}
        {recipient && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Preparing Plan for</p>
                <h3 className="text-sm font-black text-indigo-900">{recipient.name} ({recipient.section})</h3>
              </div>
            </div>
            <button 
              onClick={onClearRecipient}
              className="p-2 text-indigo-400 hover:text-rose-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="space-y-6">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {["Beginner", "Intermediate", "Advanced"].map((level) => (
              <div 
                key={level}
                className="min-w-[280px] bg-white rounded-3xl p-6 border border-slate-100 flex flex-col items-start transition-all hover:shadow-md hover:border-indigo-100 group"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-50 transition-colors">
                    <Sparkles size={20} className="text-slate-300 group-hover:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Release Path</p>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{level}</h3>
                  </div>
                </div>
                
                <div className="mb-8">
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">
                    Automatically distribute AI-personalized modules to all students categorized as <span className="font-bold text-slate-900">{level}</span> learners.
                  </p>
                </div>

                <div className="w-full space-y-3">
                  <button 
                    onClick={() => {
                      setGenerationLevel(level);
                      setGeneratedPlan(null);
                      setIsGenerating(true);
                    }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
                  >
                    <Sparkles size={14} className="text-amber-400" />
                    Generate Plan
                  </button>
                  <button 
                    onClick={() => {
                      setIsPlanSent(true);
                      setTimeout(() => {
                        setIsPlanSent(false);
                        if (recipient) onClearRecipient?.();
                      }, 3000);
                    }}
                    className="w-full py-4 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-500 transition-all"
                  >
                    Release to {level}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Container 2: Approve Plans */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Approve Plans</h2>
          <p className="text-sm font-medium text-slate-500">Student requested study paths</p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <button 
              onClick={() => setApprovalStatusFilter(approvalStatusFilter === "Approved" ? "All" : "Approved")}
              className="flex items-center gap-2.5 transition-colors hover:opacity-80"
            >
              <div className={cn("w-5 h-5 rounded-full bg-[#9FFFA1] border border-black/5 shadow-sm transition-transform", approvalStatusFilter === "Approved" ? "scale-110 ring-4 ring-[#9FFFA1]/20" : "")} />
              <span className={cn("text-xs font-black uppercase tracking-widest", approvalStatusFilter === "Approved" ? "text-slate-900" : "text-slate-400")}>Approved</span>
            </button>
            <button 
              onClick={() => setApprovalStatusFilter(approvalStatusFilter === "Rejected" ? "All" : "Rejected")}
              className="flex items-center gap-2.5 transition-colors hover:opacity-80"
            >
              <div className={cn("w-5 h-5 rounded-full bg-[#FF8E8E] border border-black/5 shadow-sm transition-transform", approvalStatusFilter === "Rejected" ? "scale-110 ring-4 ring-[#FF8E8E]/20" : "")} />
              <span className={cn("text-xs font-black uppercase tracking-widest", approvalStatusFilter === "Rejected" ? "text-slate-900" : "text-slate-400")}>Rejected</span>
            </button>
            <button 
              onClick={() => setApprovalStatusFilter(approvalStatusFilter === "Pending" ? "All" : "Pending")}
              className="flex items-center gap-2.5 transition-colors hover:opacity-80"
            >
              <div className={cn("w-5 h-5 rounded-full bg-[#FFD783] border border-black/5 shadow-sm transition-transform", approvalStatusFilter === "Pending" ? "scale-110 ring-4 ring-[#FFD783]/20" : "")} />
              <span className={cn("text-xs font-black uppercase tracking-widest", approvalStatusFilter === "Pending" ? "text-slate-900" : "text-slate-400")}>Pending</span>
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input 
                type="text" 
                placeholder="Search student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-100 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-100 transition-all"
              />
            </div>
            <div className="relative min-w-[200px]">
              <select 
                value={approvalSectionFilter}
                onChange={(e) => setApprovalSectionFilter(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 rounded-xl text-sm font-bold text-slate-900 appearance-none cursor-pointer focus:outline-none focus:border-indigo-100 transition-all"
              >
                <option value="All">All Sections</option>
                <option value="BSIT - 1A">BSIT - 1A</option>
                <option value="BSIT - 1B">BSIT - 1B</option>
                <option value="BSIT - 1C">BSIT - 1C</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredRequests.map((req) => (
                <motion.div 
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => {
                    setSelectedRequest(req);
                    setModalStatus(req.status);
                  }}
                  className="group relative p-6 bg-white border border-slate-100 rounded-2xl hover:border-indigo-100 shadow-sm shadow-slate-100/50 transition-all cursor-pointer"
                >
                  <div className={cn(
                    "absolute top-4 right-4 w-5 h-5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/5",
                    req.status === "Approved" ? "bg-[#9FFFA1]" :
                    req.status === "Rejected" ? "bg-[#FF8E8E]" : "bg-[#FFD783]"
                  )} />
                  
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-slate-900 leading-snug">
                      {req.studentName}
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {req.section}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-300">
                      {req.date}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredRequests.length === 0 && (
              <div className="col-span-full py-16 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200">
                  <ClipboardCheck size={32} />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-lg font-black text-slate-900">No requests found</h3>
                  <p className="text-xs font-medium text-slate-400">Try adjusting your filters</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedRequest(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[40px] border-2 border-slate-100 shadow-2xl overflow-hidden"
            >
              <div className="p-8 md:p-12">
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Approve Student Study Plan Request</h2>
                  <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                    <X size={24} className="text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Left Column */}
                  <div className="flex flex-col gap-4">
                    <label className="text-sm font-black uppercase tracking-widest text-slate-400">Study Plan Content</label>
                    <div className="flex-1 min-h-[300px] p-8 bg-slate-50/50 border-2 border-slate-100 rounded-[32px] overflow-y-auto">
                      <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                        {selectedRequest.content}
                      </p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-1 gap-3">
                      <button 
                        onClick={() => setModalStatus("Approved")}
                        className={cn(
                          "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all border-2",
                          modalStatus === "Approved" 
                            ? "bg-[#9FFFA1] border-[#9FFFA1] text-slate-900 shadow-lg shadow-emerald-100" 
                            : "bg-white border-slate-100 text-slate-400 hover:border-emerald-100 hover:text-emerald-500"
                        )}
                      >
                        Approve Plan
                      </button>
                      <button 
                        onClick={() => setModalStatus("Rejected")}
                        className={cn(
                          "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all border-2",
                          modalStatus === "Rejected" 
                            ? "bg-[#FF8E8E] border-[#FF8E8E] text-slate-900 shadow-lg shadow-rose-100" 
                            : "bg-white border-slate-100 text-slate-400 hover:border-rose-100 hover:text-rose-500"
                        )}
                      >
                        Reject Plan
                      </button>
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-black uppercase tracking-widest text-slate-400">Remarks</label>
                      <textarea 
                        value={modalRemarks}
                        onChange={(e) => setModalRemarks(e.target.value)}
                        placeholder="Add your comments here..."
                        className="w-full h-32 p-6 bg-white border-2 border-slate-100 rounded-[32px] text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-100 transition-all resize-none"
                      />
                    </div>

                    <button 
                      onClick={handleSend}
                      className="w-full py-4 bg-white border-2 border-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-xl shadow-slate-100"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Generation Modal */}
      <AnimatePresence>
        {isGenerating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setIsGenerating(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              {!generatedPlan ? (
                // State 1: Generation Button
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[500px] bg-slate-50/30">
                  <div className="absolute top-12 left-12 text-left">
                    <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Adaptive Learning</p>
                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Study Plan for {generationLevel}s</h2>
                  </div>
                  
                  <button 
                    onClick={handleLevelGenerate}
                    disabled={isAiThinking}
                    className="px-10 py-6 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-indigo-600 transition-all flex items-center gap-4 shadow-2xl shadow-slate-200 active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles size={24} className={isAiThinking ? "animate-spin" : "animate-pulse"} />
                    <span>{isAiThinking ? "Architecting Path..." : "Generate AI Path"}</span>
                  </button>

                  <p className="mt-8 text-slate-400 font-medium text-sm max-w-sm">
                    Our AI will analyze the curriculum requirements to create a customized learning sequence for this level.
                  </p>
                  
                  <button 
                    onClick={() => setIsGenerating(false)}
                    className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-900 bg-white shadow-sm border border-slate-50 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                // State 2: Plan Content & Release
                <div className="flex-1 flex flex-col p-8 md:p-12 overflow-hidden bg-white">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Generation Complete</p>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Study Path for {generationLevel}s</h2>
                    </div>
                    <button 
                      onClick={() => {
                        setIsGenerating(false);
                        setIsPlanSent(true);
                        setTimeout(() => setIsPlanSent(false), 3000);
                      }}
                      className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-slate-100"
                    >
                      Release Path
                    </button>
                  </div>
                  
                  <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-3xl p-8 mb-8 overflow-y-auto custom-scrollbar">
                    <div className="prose prose-slate max-w-none">
                      {generatedPlan.split('\n').map((line, i) => {
                        if (line.startsWith('###')) return <h3 key={i} className="text-xl font-black text-slate-900 mb-4">{line.replace('###', '')}</h3>;
                        if (line.startsWith('**')) return <p key={i} className="font-bold text-slate-800 mt-6 mb-2">{line.replace(/\*\*/g, '')}</p>;
                        return <p key={i} className="text-slate-600 leading-relaxed text-sm mb-4">{line}</p>;
                      })}
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><ThumbsUp size={18} /></button>
                        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><ThumbsDown size={18} /></button>
                        <button 
                          onClick={handleLevelGenerate}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <RefreshCcw size={18} className={isAiThinking ? "animate-spin" : ""} />
                        </button>
                      </div>
                      <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><MoreHorizontal size={20} /></button>
                    </div>
                    
                    <div className="relative group">
                      <form onSubmit={handleRefinePlan}>
                        <input 
                          type="text"
                          placeholder="Refine this plan with AI (e.g., 'Make it more practical')"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          disabled={isAiThinking}
                          className="w-full pl-8 pr-16 py-5 bg-slate-50 border-2 border-transparent focus:border-indigo-100 rounded-[28px] font-medium text-sm transition-all focus:outline-none disabled:opacity-50"
                        />
                        <button 
                          type="submit"
                          disabled={!aiPrompt.trim() || isAiThinking}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-600 transition-all shadow-lg shadow-slate-100 disabled:opacity-50"
                        >
                          {isAiThinking ? <RefreshCcw size={18} className="animate-spin" /> : <ArrowUp size={22} />}
                        </button>
                      </form>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setIsGenerating(false)}
                    className="absolute top-8 right-8 p-2 text-slate-300 hover:text-slate-900 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ClassRecordsView = () => {
  const [selectedSection, setSelectedSection] = useState("BSIT - 1A");
  const sections = ["BSIT - 1A", "BSIT - 1B", "BSIT - 1C"];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      alert(`Class record "${file.name}" uploaded successfully!`);
    }
  };

  const filteredStudents = GLOBAL_STUDENTS
    .filter(s => s.section === selectedSection)
    .sort((a, b) => {
      const aLast = a.name.split(" ").slice(-1)[0];
      const bLast = b.name.split(" ").slice(-1)[0];
      if (aLast !== bLast) return aLast.localeCompare(bLast);
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Class Records</h1>
          <p className="text-slate-500 font-medium">Check student's class records</p>
        </div>
        <input 
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept=".csv,.xlsx,.xls"
        />
        <button 
          onClick={handleUploadClick}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Upload size={16} />
          Upload Class Record
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-10 overflow-x-auto pb-2 scrollbar-hide">
          {sections.map((section) => (
            <button
              key={section}
              onClick={() => setSelectedSection(section)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                selectedSection === section 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              )}
            >
              {section}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-4">
            <thead>
              <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-6 py-2">Student Name</th>
                <th className="px-6 py-2 text-center">Act 1</th>
                <th className="px-6 py-2 text-center">Act 2</th>
                <th className="px-6 py-2 text-center">Quiz 1</th>
                <th className="px-6 py-2 text-center">Quiz 2</th>
                <th className="px-6 py-2 text-center">PT 1</th>
                <th className="px-6 py-2 text-center">PT 2</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, i) => (
                <tr key={i} className="group">
                  <td className="px-6 py-4 bg-slate-50 group-hover:bg-indigo-50/30 rounded-l-2xl border-y border-l border-slate-100 group-hover:border-indigo-100 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 font-bold text-[10px]">
                        {student.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-bold text-slate-900 text-xs whitespace-nowrap">{student.name}</span>
                    </div>
                  </td>
                  {[1, 2, 3, 4, 5, 6].map((_, idx) => (
                    <td key={idx} className={cn(
                      "px-6 py-4 bg-slate-50 group-hover:bg-indigo-50/30 border-y border-slate-100 text-center font-bold text-xs transition-all group-hover:border-indigo-100",
                      idx === 5 ? "rounded-r-2xl border-r" : ""
                    )}>
                      <span className="text-slate-300">-</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TeacherFeedbackView = () => (
  <div className="bg-white rounded-[40px] p-12 border border-slate-100 shadow-sm">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
          <MessageSquare size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Provide Student Feedback</h1>
          <p className="text-slate-500 text-sm">Send academic guidance and feedback to your students</p>
        </div>
      </div>
      <button className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
        New Feedback
      </button>
    </div>

    <div className="grid grid-cols-1 gap-6">
      {[
        { name: "John Doe", course: "Data Structures", lastActive: "2h ago", status: "Needs Guidance" },
        { name: "Jane Smith", course: "Algorithms", lastActive: "5h ago", status: "Excellent Progress" },
        { name: "Mike Ross", course: "Database Systems", lastActive: "1d ago", status: "Pending Review" }
      ].map((student, i) => (
        <div key={i} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-indigo-200 transition-all group">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm font-black text-lg">
                {student.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg">{student.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{student.course}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active {student.lastActive}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight",
                student.status === "Excellent Progress" ? "bg-emerald-50 text-emerald-600" : 
                student.status === "Needs Guidance" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
              )}>
                {student.status}
              </span>
              <button className="p-3 bg-white text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 hover:border-indigo-100 shadow-sm transition-all">
                <Send size={18} />
              </button>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-200/50">
            <textarea 
              placeholder={`Write feedback for ${student.name}...`}
              className="w-full p-4 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none h-24"
            />
            <div className="flex justify-end mt-4">
              <button className="flex items-center gap-2 px-6 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all">
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      ))}
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

const ResourcesView = ({ uploadedFiles, setUploadedFiles }: { uploadedFiles: any[]; setUploadedFiles: React.Dispatch<React.SetStateAction<any[]>> }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Modules");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setSelectedCategory("Modules");
  };

  const confirmUpload = () => {
    if (!pendingFile) return;
    
    const newFile = {
      name: pendingFile.name,
      type: pendingFile.name.split('.').pop()?.toUpperCase() || "FILE",
      size: (pendingFile.size / 1024).toFixed(1) + " KB",
      category: selectedCategory,
      items: []
    };
    
    setUploadedFiles(prev => [...prev, newFile]);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const categories = [
    { title: "Modules", items: uploadedFiles.filter(f => f.category === "Modules") },
    { title: "Course Outline", items: uploadedFiles.filter(f => f.category === "Course Outline") },
    { title: "Videos", items: uploadedFiles.filter(f => f.category === "Videos") }
  ];

  const filteredCategories = categories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => (item as any).name.toLowerCase().includes(searchTerm.toLowerCase()))
  }));

  const handleDeleteResource = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Resources</h1>
          <p className="text-slate-500 font-medium">Upload and manage learning materials for your students</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-4 mb-12">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search resource..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <input 
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Upload size={16} />
            Upload File
          </button>
        </div>

        <div className="space-y-12">
          {filteredCategories.map((cat) => (
            <div key={cat.title}>
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-black text-slate-900 shrink-0">{cat.title}</h2>
                <div className="h-px bg-slate-100 w-full" />
              </div>

              {cat.items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {cat.items.map((item: any, i: number) => (
                    <div 
                      key={i} 
                      className="p-6 rounded-[32px] border border-slate-100 bg-white hover:shadow-md hover:border-indigo-100 transition-all group"
                    >
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-50 transition-colors">
                          <div className={cn(
                            "w-8 h-8 rounded-full border border-slate-100 bg-white flex items-center justify-center",
                            item.category === "Videos" ? "text-indigo-600" : 
                            item.category === "Course Outline" ? "text-amber-600" : "text-emerald-600"
                          )}>
                            {item.category === "Videos" ? <PlayCircle size={16} /> : 
                             item.category === "Course Outline" ? <MoreHorizontal size={16} /> : <FileText size={16} />}
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 leading-tight">{item.name}</h3>
                          <p className="text-xs font-bold text-slate-400 mt-0.5">{item.type} • {item.size}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button className="p-2.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                          <ExternalLink size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteResource(item.name)}
                          className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-50 rounded-[32px] bg-slate-50/10">
                  <Library className="text-slate-200 mb-3" size={32} />
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No {cat.title.toLowerCase()} added</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Category Selection Modal */}
      <AnimatePresence>
        {pendingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setPendingFile(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 border border-slate-100"
            >
              <div className="mb-8">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-[24px] flex items-center justify-center mb-6">
                  <Upload size={32} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Select Category</h2>
                <p className="text-slate-500 font-medium text-sm mt-1">Where should we put "{pendingFile.name}"?</p>
              </div>

              <div className="space-y-3 mb-10">
                {["Modules", "Course Outline", "Videos"].map((cat) => (
                  <label 
                    key={cat} 
                    className={cn(
                      "flex items-center justify-between p-5 rounded-[24px] border-2 transition-all cursor-pointer group",
                      selectedCategory === cat 
                        ? "border-indigo-600 bg-indigo-50/30" 
                        : "border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        selectedCategory === cat ? "bg-indigo-600 text-white" : "bg-white text-slate-400 group-hover:text-slate-600"
                      )}>
                        {cat === "Modules" && <FileText size={20} />}
                        {cat === "Course Outline" && <MoreHorizontal size={20} />}
                        {cat === "Videos" && <PlayCircle size={20} />}
                      </div>
                      <span className={cn(
                        "font-black text-sm uppercase tracking-widest",
                        selectedCategory === cat ? "text-indigo-600" : "text-slate-500"
                      )}>
                        {cat}
                      </span>
                    </div>
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="radio" 
                        name="resource-category"
                        className="sr-only"
                        checked={selectedCategory === cat}
                        onChange={() => setSelectedCategory(cat)}
                      />
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                        selectedCategory === cat ? "border-indigo-600" : "border-slate-200"
                      )}>
                        {selectedCategory === cat && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmUpload}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all active:scale-[0.98]"
                >
                  Confirm Upload
                </button>
                <button 
                  onClick={() => setPendingFile(null)}
                  className="w-full py-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-rose-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MISDashboard = ({ 
  teachers, 
  students, 
  sections,
  onNavigate,
  addNotification,
  initialTab = "dashboard"
}: { 
  teachers: any[], 
  students: any[], 
  sections: any[],
  onNavigate?: (tab: "dashboard" | "teachers" | "students" | "sections") => void,
  addNotification?: (title: string, message: string, type: "info" | "success" | "warning") => void,
  initialTab?: "dashboard" | "teachers" | "students" | "sections"
}) => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "teachers" | "students" | "sections">(initialTab);
  
  // Sync tab if prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

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
      const collectionName = activeTab === "teachers" ? "teachers" : activeTab === "students" ? "students" : "sections";
      if (editingItem) {
        await updateDoc(doc(db, collectionName, editingItem.id), formData);
      } else {
        await addDoc(collection(db, collectionName), formData);
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const handleDelete = (item: any) => {
    setItemToDelete(item);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const collectionName = activeTab === "teachers" ? "teachers" : activeTab === "students" ? "students" : "sections";
      await deleteDoc(doc(db, collectionName, itemToDelete.id));
      setItemToDelete(null);
      
      addNotification?.(
        "Deleted Successfully",
        `The ${activeTab.slice(0, -1)} has been removed from the system.`,
        "success"
      );
    } catch (err) {
      console.error("Delete failed", err);
      addNotification?.("Error", "Failed to delete item. Please try again.", "warning");
    }
  };

  if (activeTab === "dashboard") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">MIS Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Overview of institutional data components</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[
            { label: "Teachers", count: teachers.length, icon: GraduationCap, color: "indigo", tab: "teachers" as const },
            { label: "Students", count: students.length, icon: Users, color: "emerald", tab: "students" as const },
            { label: "Class Sections", count: sections.length, icon: Library, color: "amber", tab: "sections" as const }
          ].map((stat, i) => (
            <button 
              key={i} 
              onClick={() => onNavigate ? onNavigate(stat.tab) : setActiveTab(stat.tab)}
              className="group bg-white p-5 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 hover:border-indigo-200 hover:shadow-md transition-all text-left"
            >
              <div className={cn("w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", `bg-${stat.color}-50 text-${stat.color}-600`)}>
                <stat.icon size={24} className="md:size-28" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xl md:text-2xl font-black text-slate-900">{stat.count}</p>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-all group-hover:translate-x-1" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-2.5 bg-indigo-100 text-indigo-600 rounded-lg md:rounded-xl">
                  <Activity size={20} />
                </div>
                <h2 className="text-base md:text-lg font-black text-slate-900">Recent Teachers</h2>
              </div>
              <button 
                onClick={() => onNavigate ? onNavigate("teachers") : setActiveTab("teachers")}
                className="text-[10px] md:text-xs font-bold text-indigo-600 hover:underline"
              >
                View All
              </button>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left min-w-[300px]">
                <tbody className="divide-y divide-slate-50">
                  {teachers.slice(0, 5).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-8 py-4">
                        <p className="font-bold text-slate-900 text-xs md:text-sm">{t.name}</p>
                        <p className="text-[9px] md:text-[10px] text-slate-400 font-mono truncate max-w-[150px] md:max-w-none">{t.email || t.id}</p>
                      </td>
                      <td className="px-6 md:px-8 py-4 text-right">
                        <span className="px-2 py-0.5 md:py-1 bg-indigo-50 text-indigo-600 text-[9px] md:text-[10px] font-bold rounded-lg uppercase whitespace-nowrap">
                          {t.title}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {teachers.length === 0 && (
                    <tr>
                      <td className="px-8 py-8 text-center text-slate-400 italic text-xs">No teachers added yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-2.5 bg-emerald-100 text-emerald-600 rounded-lg md:rounded-xl">
                  <Library size={20} />
                </div>
                <h2 className="text-base md:text-lg font-black text-slate-900">Active Sections</h2>
              </div>
              <button 
                onClick={() => onNavigate ? onNavigate("sections") : setActiveTab("sections")}
                className="text-[10px] md:text-xs font-bold text-emerald-600 hover:underline"
              >
                View All
              </button>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left min-w-[300px]">
                <tbody className="divide-y divide-slate-50">
                  {sections.slice(0, 5).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-8 py-4">
                        <p className="font-bold text-slate-900 text-xs md:text-sm">{s.name}</p>
                        <p className="text-[9px] md:text-[10px] text-slate-400 truncate max-w-[150px] md:max-w-none">Prog: {teachers.find(t => t.id === s.programmingTeacherId)?.name || "N/A"}</p>
                      </td>
                      <td className="px-6 md:px-8 py-4 text-right">
                        <span className="px-2 py-0.5 md:py-1 bg-emerald-50 text-emerald-600 text-[9px] md:text-[10px] font-bold rounded-lg uppercase whitespace-nowrap">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sections.length === 0 && (
                    <tr>
                      <td className="px-8 py-8 text-center text-slate-400 italic text-xs">No sections created yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">MIS Workspace</h1>
          <p className="text-slate-500 text-sm mt-1">Manage {activeTab} and academic structure</p>
        </div>
        <button 
          onClick={() => setActiveTab("dashboard")}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 px-4 py-2 rounded-xl"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      {/* Stats area (Compact) */}
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
                {activeTab !== "sections" && <th className="px-8 py-4">Email / ID</th>}
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
                  {activeTab !== "sections" && (
                    <td className="px-8 py-5">
                      <p className="text-xs text-slate-400 font-mono">{item.email || item.id}</p>
                    </td>
                  )}
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(item)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Pen size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(activeTab === "teachers" ? teachers : activeTab === "students" ? students : sections).length === 0 && (
                <tr>
                  <td colSpan={activeTab === "sections" ? 3 : 4} className="px-8 py-20 text-center">
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

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Are you sure?</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-8">
                  You are about to delete <span className="font-bold text-slate-900">{itemToDelete.name}</span>. This action cannot be undone.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="py-4 bg-rose-600 text-white rounded-2xl font-black text-xs hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all uppercase tracking-widest"
                  >
                    Delete Now
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

                  {activeTab !== "sections" && (
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
                  )}

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
  const [selectedStudentForPlan, setSelectedStudentForPlan] = useState<Student | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<"teacher" | "mis" | null>(null);
  const [teacherSelectedSection, setTeacherSelectedSection] = useState<string | null>(null);
  const [teacherSelectedRisk, setTeacherSelectedRisk] = useState<"Low" | "Moderate" | "High" | "All">("All");

  // Data States
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  const [syllabus, setSyllabus] = useState<FileData | null>(null);
  const [calendarFile, setCalendarFile] = useState<FileData | null>(null);
  const [gradingSheet, setGradingSheet] = useState<FileData | null>(null);
  const [pretestScores, setPretestScores] = useState<FileData | null>(null);
  
  // UI States
  const [activeView, setActiveView] = useState<"dashboard" | "calendar" | "path" | "activities" | "performance" | "quiz" | "alerts" | "students" | "plans" | "monitoring" | "feedback" | "resources" | "teachers" | "sections" | "mis">("dashboard");
  const [activeMisTab, setActiveMisTab] = useState<"dashboard" | "academicYear" | "semester" | "user" | "section" | "class" | "classUser">("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
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
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Close simple modals when clicking away logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProfileDropdownOpen) {
        setIsProfileDropdownOpen(false);
      }
    };
    if (isProfileDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const toggleProfileDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  };
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
          } else {
            // Check institutionUsers by email for provisioned accounts
            if (user.email) {
              const q = query(collection(db, "institutionUsers"), where("email", "==", user.email));
              const querySnap = await getDocs(q);
              if (!querySnap.empty) {
                const data = querySnap.docs[0].data();
                setUserProfile(data);
                // Map roles (MIS/Teacher/Student) to the app's internal role system
                if (data.role === "MIS") {
                  setAdminRole("mis");
                } else if (data.role === "Teacher") {
                  setAdminRole("teacher");
                }
              }
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (adminRole) {
        setAdminRole(null);
      }
      setActiveView("dashboard");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // Global Listeners for Teachers and Students
  useEffect(() => {
    if (!user) return;
    
    const unsub = onSnapshot(collection(db, "institutionUsers"), (snap) => {
      const allUsers = snap.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: data.id || doc.id };
      });
      setTeachers(allUsers.filter((u: any) => u.role === "Teacher"));
      setStudents(allUsers.filter((u: any) => u.role === "Student"));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "institutionUsers"));

    return () => unsub();
  }, [user]);

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
    setIsTweaking(true);
    setError(null);
    
    const newUserMessage = { role: "user" as const, content: message };
    setChatMessages(prev => [...prev, newUserMessage]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-1.5-flash";

      let prompt = "";
      const resourceContext = uploadedFiles.length > 0 
        ? `\nAVAILABLE RESOURCES (Refer to these by name when suggesting study materials): \n${uploadedFiles.map(f => `- ${f.name} (Category: ${f.category})`).join("\n")}`
        : "";
      
      if (message.toLowerCase().includes("who are you") || message.toLowerCase().includes("who am i")) {
        prompt = `
          You are a smart study assistant. 
          Introduce yourself to the student in a kind, encouraging, and professional manner.
          Explain that you are here to help them manage their study plan, analyze their materials (like ${uploadedFiles.map(f => f.name).join(", ")}), and nurture their academic success.
          Keep it relatively brief but very welcoming.
        `;
      } else if (!plan) {
        setIsTweaking(false);
        return; // Normal tweaks need a plan
      } else {
        prompt = `
          You are an Agentic Study Success System for students. 
          The student has an existing study plan and can ONLY request to modify or clarify this specific study plan.
          ${resourceContext}

          EXISTING PLAN:
          ${plan}
          
          STUDENT REQUEST:
          ${message}
          
          STRICT RULES:
          1. ONLY process requests that are DIRECTLY related to modifying or clarifying the EXISTING PLAN (e.g., adding topics, changing times, explaining a specific week's plan).
          2. REJECT prompts that are unrelated, off-topic, or general conversation.
          3. REJECT requests for you to do their homework, solve equations, write essays, or perform academic tasks on their behalf.
          4. When rejecting, be kind and encouraging, but firm. Explain that your purpose is to nurture their academic excellence by helping them manage their study schedule, not by doing the work for them.
          5. If asked about syllabus or modules, refer to the available resources: ${uploadedFiles.map(f => f.name).join(", ")}.
          
          TASK:
          - IF THE REQUEST IS VALID AND ABOUT PLAN MODIFICATION:
            - Modify the EXISTING PLAN based on the STUDENT REQUEST.
            - Ensure the plan remains broken down by SPECIFIC DATES.
            - Maintain the same structure and quality.
            - Provide the full updated plan in Markdown format.
            - AT THE VERY END, provide the updated JSON block of calendar events.
          - IF THE REQUEST IS INVALID (unrelated or academic work request):
            - Provide your kind rejection message.
            - DO NOT provide any updated plan or JSON.
        `;
      }

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
      
      let finalChatMessage = "";

      if (jsonMatch) {
        const newEvents = JSON.parse(jsonMatch[0]).map((e: any) => ({
          ...e,
          id: Math.random().toString(36).substr(2, 9),
          start: new Date(e.start),
          end: new Date(e.end)
        }));
        setEvents(newEvents);
        
        const updatedPlan = text.replace(/\[\s*\{.*\}\s*\]/s, "").trim() || "Failed to update plan.";
        setPlan(updatedPlan);
        finalChatMessage = "I've updated your study plan based on your request. You can see the changes in the plan view.";
      } else {
        // Rejection or clarification
        finalChatMessage = text.trim();
      }

      const modelResponse = { role: "model" as const, content: finalChatMessage };
      setChatMessages(prev => [...prev, modelResponse]);
      
      // Update history
      setChatHistory(prev => {
        if (prev.length === 0) {
          return [{
            id: Math.random().toString(36).substr(2, 9),
            title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
            messages: [newUserMessage, modelResponse]
          }];
        }
        const last = prev[0];
        return [{ ...last, messages: [...last.messages, newUserMessage, modelResponse] }, ...prev.slice(1)];
      });

    } catch (err: any) {
      setError(err.message || "An error occurred while tweaking the plan.");
      setChatMessages(prev => [...prev, { role: "model", content: "Sorry, I encountered an error while trying to update your plan. Please try again." }]);
    } finally {
      setIsTweaking(false);
    }
  };

   const generateStudyPlan = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-1.5-flash";

      const syllabusContent = syllabus?.content || (uploadedFiles.find(f => f.category === "Course Outline")?.content) || "No syllabus provided. Please generate a general study plan for BSIT Level.";
      const calendarContent = calendarFile?.content || "No specific calendar provided. Assume 16 weeks duration.";

      const feedbackInstruction = planFeedback === "down" 
        ? "\n- NOTE: The previous plan was marked as unsatisfactory by the student. Please try to improve the structure, detail, or alignment with the calendar."
        : "";

      const resourceContext = uploadedFiles.length > 0 
        ? `
        AVAILABLE RESOURCES (Refer to these in the plan):
        ${uploadedFiles.map(f => `- ${f.name} (Category: ${f.category}, Type: ${f.type})`).join("\n")}
        `
        : "";

      const prompt = `
        You are an Agentic Study Success System for BSIT students.
        ${feedbackInstruction}
        ${resourceContext}
        
        INPUT DATA:
        1. COURSE OUTLINE/SYLLABUS: ${syllabusContent}
        2. CALENDAR: ${calendarContent}
        3. SEMESTER DURATION: From ${semesterDates.start} to ${semesterDates.end}
        
        TASK:
        - Strictly analyze the provided COURSE OUTLINE/SYLLABUS and CALENDAR. 
        - FIRST, extract all official classes and schedules from the CALENDAR data.
        - SECOND, identify the specific topics and lessons listed in the COURSE OUTLINE/SYLLABUS.
        - THIRD, search the web for credible references (scientific papers, university research) on how long each topic takes to learn/master on average. 
        - DO NOT use open forums like Reddit, Quora, or blogs as references.
        - Adjust the study plan's time allocation and spacing based on these credible findings.
        - Create a "Full Semester Learning Roadmap" that spans from ${semesterDates.start} to ${semesterDates.end}. 
        - The roadmap MUST be broken down into SPECIFIC DATES (e.g., May 15, May 16...).
        - Mapping specific topics from the syllabus to each day/session.
        - FOR EACH TOPIC, mention which of the AVAILABLE RESOURCES the student should refer to (if any).
        - CRITICAL: The study plan MUST be contained within the semester dates: ${semesterDates.start} to ${semesterDates.end}. 
        - It cannot start earlier than ${semesterDates.start} and it cannot end later than ${semesterDates.end}.
        - CRITICAL: Study sessions MUST NOT overlap with the official classes extracted from the CALENDAR.
        - Prioritize foundational concepts from the document before advanced ones.
        - Include specific coding exercises for each weekly block.
        
        OUTPUT FORMAT:
        - Use clear Markdown headers for each week and sub-headers for SPECIFIC DATES.
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
    return <LoginView onLoginSuccess={() => setActiveView("dashboard")} onAdminLogin={(role) => setAdminRole(role)} addNotification={addNotification} />;
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
        "fixed left-0 top-0 bottom-0 bg-white border-r border-slate-200 z-50 transition-all duration-300 flex flex-col",
        isSidebarCollapsed ? "w-20" : "w-64",
        "md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className={cn("p-6 border-b border-slate-100 flex items-center transition-all duration-300", isSidebarCollapsed ? "justify-center" : "justify-between")}>
          <div className={cn("flex items-center gap-2.5", isSidebarCollapsed && "hidden")}>
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
              <BrainCircuit className="text-white" size={24} />
            </div>
            <span className="font-black text-xl tracking-tighter text-slate-900">AgentIntelProg</span>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
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
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "dashboard" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Dashboard" : ""}
              >
                <LayoutDashboard size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Dashboard</span>}
              </button>
              <button 
                onClick={() => {
                  setTeacherSelectedRisk("All");
                  setActiveView("alerts");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "alerts" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Alerts" : ""}
              >
                <Bell size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Alerts</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("students");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "students" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Student List" : ""}
              >
                <Users size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Student List</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("plans");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "plans" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Study Plans" : ""}
              >
                <Target size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Study Plans</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("monitoring");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "monitoring" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Class Records" : ""}
              >
                <ClipboardList size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Class Records</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("resources");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "resources" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Resources" : ""}
              >
                <Library size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Resources</span>}
              </button>
            </>
          ) : adminRole === "mis" ? (
            <>
              {[
                { id: "dashboard", label: "MIS Dashboard", icon: LayoutDashboard },
                { id: "academicYear", label: "Academic Year", icon: CalendarIcon },
                { id: "semester", label: "Semester", icon: ClipboardList },
                { id: "user", label: "User", icon: Users },
                { id: "section", label: "Section", icon: BookOpen },
                { id: "class", label: "Class", icon: Group },
                { id: "classUser", label: "Class_User", icon: UserCheck }
              ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => {
                    setActiveView("mis");
                    setActiveMisTab(item.id as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                    (activeView === "mis" && activeMisTab === item.id) ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                  )}
                  title={isSidebarCollapsed ? item.label : ""}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </button>
              ))}
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
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "dashboard" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Dashboard" : ""}
              >
                <LayoutDashboard size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Dashboard</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("calendar");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "calendar" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Calendar" : ""}
              >
                <CalendarIcon size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Calendar</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("path");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "path" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Study Plan" : ""}
              >
                <Target size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Study Plan</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("activities");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "activities" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Activities" : ""}
              >
                <ClipboardList size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Activities</span>}
              </button>
              <button 
                onClick={() => {
                  setActiveView("performance");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-start px-4",
                  activeView === "performance" ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50"
                )}
                title={isSidebarCollapsed ? "Performance" : ""}
              >
                <TrendingUp size={18} className="flex-shrink-0" />
                {!isSidebarCollapsed && <span>Performance</span>}
              </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className={cn("bg-slate-50 rounded-2xl transition-all duration-300", isSidebarCollapsed ? "p-3" : "p-4")}>
            {!isSidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Status</p>}
            <div className={cn("flex items-center gap-2 text-xs font-bold text-slate-700", isSidebarCollapsed ? "justify-center" : "justify-start")}>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              {!isSidebarCollapsed && <span>Agent Online</span>}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-h-screen p-4 sm:p-6 lg:p-10 transition-all duration-300",
        isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
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
                {/* Breadcrumb removed */}
                {!adminRole && (
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    Academy Dashboard
                  </h1>
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

                <div className="flex items-center gap-3 pl-4 border-l border-slate-200 relative">
                  <button 
                    onClick={toggleProfileDropdown}
                    className="flex items-center gap-3 text-right group transition-all"
                  >
                    <div className="hidden sm:block">
                      <p className="text-xs font-black text-slate-900 truncate max-w-[120px] group-hover:text-indigo-600 transition-colors">
                        {user?.email === "MIStest373@gmail.com" ? "John Santos" : (userProfile?.displayName || (adminRole === "teacher" ? "Professor Admin" : adminRole === "mis" ? "John Santos" : (user?.displayName || "Student")))}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {user?.email === "MIStest373@gmail.com" ? "head MIS admin" : (adminRole === "teacher" ? "Faculty" : adminRole === "mis" ? (userProfile?.position || "head MIS admin") : "BSIT Year 1")}
                      </p>
                    </div>
                    <div className="relative">
                      <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
                        isProfileDropdownOpen ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200"
                      )}>
                        <User size={20} />
                      </div>
                      <div className={cn(
                        "absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full border-2 border-slate-50 flex items-center justify-center text-slate-400 transition-transform",
                        isProfileDropdownOpen && "rotate-180"
                      )}>
                        <ChevronDown size={10} />
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isProfileDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-4 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[110] overflow-hidden p-2"
                      >
                        <div className="px-4 py-3 border-b border-slate-50 mb-1 lg:hidden">
                          <p className="text-xs font-black text-slate-900 truncate">
                            {user?.email === "MIStest373@gmail.com" ? "John Santos" : (userProfile?.displayName || (adminRole === "teacher" ? "Professor Admin" : adminRole === "mis" ? "John Santos" : (user?.displayName || "Student")))}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                            {user?.email === "MIStest373@gmail.com" ? "head MIS admin" : (adminRole === "teacher" ? "Faculty" : adminRole === "mis" ? (userProfile?.position || "head MIS admin") : "BSIT Year 1")}
                          </p>
                        </div>
                        <button 
                          onClick={() => {
                            setIsSettingsModalOpen(true);
                            setIsProfileDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all text-left"
                        >
                          <SettingsIcon size={18} />
                          <span>Settings</span>
                        </button>
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all text-left"
                        >
                          <LogOut size={18} />
                          <span>Logout</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
              <TeacherDashboard 
                onNavigate={(view) => setActiveView(view)} 
                onSelectSection={(section) => setTeacherSelectedSection(section)}
                onSelectRisk={(risk) => setTeacherSelectedRisk(risk)}
              />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "alerts" && (
            <motion.div 
              key="teacher-alerts"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
            <AlertsView 
                initialRisk={teacherSelectedRisk}
                onBack={() => {
                  setTeacherSelectedRisk("All");
                  setActiveView("dashboard");
                }}
              />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "students" && (
            <motion.div 
              key="teacher-students"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <StudentListView 
                initialSection={teacherSelectedSection}
                onBack={() => setTeacherSelectedSection(null)}
                onSendPlan={(student) => {
                  setSelectedStudentForPlan(student);
                  setActiveView("plans");
                }}
              />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "plans" && (
            <motion.div 
              key="teacher-plans"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <StudyPlansView 
                recipient={selectedStudentForPlan}
                onClearRecipient={() => setSelectedStudentForPlan(null)}
                syllabus={syllabus}
                calendarFile={calendarFile}
                uploadedFiles={uploadedFiles}
                semesterDates={semesterDates}
              />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "monitoring" && (
            <motion.div 
              key="teacher-monitoring"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ClassRecordsView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "feedback" && (
            <motion.div 
              key="teacher-feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <TeacherFeedbackView />
            </motion.div>
          )}

          {adminRole === "teacher" && activeView === "resources" && (
            <motion.div 
              key="teacher-resources"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ResourcesView 
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
              />
            </motion.div>
          )}

          {adminRole === "mis" && activeView === "mis" && (
            <motion.div 
              key="mis-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MISView userProfile={userProfile} activeTab={activeMisTab} setActiveTab={setActiveMisTab} addNotification={addNotification} />
            </motion.div>
          )}

          {adminRole === "mis" && activeView === "dashboard" && (
            <motion.div 
              key="mis-dashboard-redirect"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden"
            >
              {(() => { setActiveView("mis"); return null; })()}
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
              <CalendarView 
                events={events} 
                calendarFile={calendarFile} 
                setCalendarFile={setCalendarFile} 
              />
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
                semesterDates={semesterDates}
                setSemesterDates={setSemesterDates}
                chatMessages={chatMessages}
                chatHistory={chatHistory}
                isTweaking={isTweaking}
                onTweakPlan={handleTweakPlan}
                onSelectHistory={(item: any) => {
                  setChatMessages(item.messages);
                }}
                onFeedback={(type: any) => {
                  setPlanFeedback(type);
                  addNotification(
                    "Feedback Received",
                    `Thank you! Your feedback helps the AI improve future study plans.`,
                    type === "up" ? "success" : "info"
                  );
                }}
                uploadedFiles={uploadedFiles}
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
                <ActivityView 
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

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] border-2 border-slate-900 shadow-2xl p-10"
            >
              <div className="space-y-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight">Settings</h2>
                  <button onClick={() => setIsSettingsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                    <X size={24} className="text-slate-400" />
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Dark Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-slate-900">Dark Mode</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 uppercase">On</span>
                      <button 
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 transition-all duration-300 relative",
                          isDarkMode ? "bg-slate-900" : "bg-slate-200"
                        )}
                      >
                        <motion.div 
                          animate={{ x: isDarkMode ? 0 : 24 }}
                          className="w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                      <span className="text-xs font-bold text-slate-400 uppercase">Off</span>
                    </div>
                  </div>

                  {/* Notifications Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-slate-900">Enable Notifications</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 uppercase">On</span>
                      <button 
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 transition-all duration-300 relative",
                          notificationsEnabled ? "bg-slate-900" : "bg-slate-200"
                        )}
                      >
                        <motion.div 
                          animate={{ x: notificationsEnabled ? 0 : 24 }}
                          className="w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                      <span className="text-xs font-bold text-slate-400 uppercase">Off</span>
                    </div>
                  </div>

                  {/* Terms Link */}
                  <button className="w-full flex items-center justify-between py-2 group">
                    <span className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">View Terms and Conditions</span>
                    <ArrowUpRight size={24} className="text-slate-900 group-hover:text-indigo-600 transition-colors" />
                  </button>

                  {/* Privacy Link */}
                  <button className="w-full flex items-center justify-between py-2 group">
                    <span className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">View Privacy Policy</span>
                    <ArrowUpRight size={24} className="text-slate-900 group-hover:text-indigo-600 transition-colors" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  </div>
  );
}
