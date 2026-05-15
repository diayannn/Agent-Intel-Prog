import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin with explicit project ID
if (admin.apps.length === 0) {
  console.log("Attempting to initialize Firebase Admin with Project ID:", firebaseConfig.projectId);
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
  console.log("Firebase Admin successfully initialized.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const API_KEY = process.env.GEMINI_API_KEY;

  // Gemini AI Setup
  const genAI = new GoogleGenAI({ 
    apiKey: API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Health check route to verify configuration
  app.get("/api/config-check", (req, res) => {
    res.json({
      activeProjectId: admin.app().options.projectId,
      hasAuth: !!admin.auth,
      apps: admin.apps.map(a => a.name),
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    });
  });

  // Gemini Proxy Route
  app.post("/api/ai/generate", async (req, res) => {
    const { prompt, model: modelName = "gemini-3-flash-preview", config } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is not set on the server. Please add your Gemini API key in the 'Settings > Secrets' panel of AI Studio Build." 
      });
    }

    try {
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: config
      });
      res.json({ text: result.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      let errorMessage = error.message || "Failed to generate content";
      
      // Specifically handle Quota/Billing errors
      if (
        errorMessage.includes("RESOURCE_EXHAUSTED") || 
        errorMessage.includes("429") || 
        errorMessage.includes("credits are depleted") ||
        errorMessage.includes("quota")
      ) {
        errorMessage = "Your Gemini API quota or prepayment credits have been exhausted. Please visit https://ai.studio/projects to manage your billing or wait for the quota to reset.";
      }
      
      res.status(500).json({ error: errorMessage });
    }
  });

  // API Routes
  app.post("/api/create-user", async (req, res) => {
    const { email, password, displayName, role } = req.body;
    
    try {
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
        // If exists, update existing user
        const updateData: any = {};
        if (displayName) updateData.displayName = displayName;
        // Optionally update password if provided and we want to enforce it, 
        // but usually we stay safe with existing passwords
        await admin.auth().updateUser(userRecord.uid, updateData);
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email,
            password, // Use provided password for new users
            displayName,
          });
        } else {
          throw e;
        }
      }

      // Always set/refresh custom claims
      await admin.auth().setCustomUserClaims(userRecord.uid, { role });

      res.status(201).json({ uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating/syncing user:", error);
      let message = error.message;
      if (message.includes("identitytoolkit.googleapis.com")) {
        const projId = admin.app().options.projectId || "your-project-id";
        message = `Identity Toolkit API is not enabled in your Google Cloud Project (${projId}). Please visit https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projId} to enable it. Note: If you just enabled it, please wait 5-10 minutes for propagation. Also ensure you have clicked "Get Started" in Firebase Console > Authentication.`;
      }
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/delete-user/:uid", async (req, res) => {
    const { uid } = req.params;
    try {
      await admin.auth().deleteUser(uid);
      res.status(200).json({ message: "User deleted from Auth" });
    } catch (error: any) {
      console.error("Error deleting user from Auth:", error);
      let message = error.message;
      if (message.includes("identitytoolkit.googleapis.com")) {
        const projId = admin.app().options.projectId || "your-project-id";
        message = `Identity Toolkit API is not enabled. Please enable it for project ${projId} in the GCP console.`;
      }
      res.status(500).json({ error: message });
    }
  });

  app.patch("/api/update-user/:uid", async (req, res) => {
    const { uid } = req.params;
    const { email, password, displayName } = req.body;
    try {
      const updateData: any = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (displayName) updateData.displayName = displayName;
      
      await admin.auth().updateUser(uid, updateData);
      res.status(200).json({ message: "User updated in Auth" });
    } catch (error: any) {
      console.error("Error updating user in Auth:", error);
      let message = error.message;
      if (message.includes("identitytoolkit.googleapis.com")) {
        const projId = admin.app().options.projectId || "your-project-id";
        message = `Identity Toolkit API is not enabled. Please enable it for project ${projId} in the GCP console.`;
      }
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
