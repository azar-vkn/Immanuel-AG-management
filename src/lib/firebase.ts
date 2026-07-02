// Firebase Configuration
// Follow these steps to set up Firebase:
//
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project or select existing one
// 3. Enable Authentication:
//    - Go to Authentication > Sign-in method
//    - Enable Email/Password provider
// 4. Create Firestore Database:
//    - Go to Firestore Database
//    - Create database (start in production mode)
//    - Set up security rules (see below)
// 5. Get your config:
//    - Go to Project Settings > General
//    - Scroll to "Your apps" > Web app
//    - Copy the firebaseConfig object
// 6. Replace the placeholder values below

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyAMKgtWC9rGXPXPrhGtBVEP4C5aYMbvp3Q",
  authDomain: "immanuel-ag-management.firebaseapp.com",
  projectId: "immanuel-ag-management",
  storageBucket: "immanuel-ag-management.firebasestorage.app",
  messagingSenderId: "384790736010",
  appId: "1:384790736010:web:2c8c4b4a69a62c794b9173",
  measurementId: "G-0SWZTHVQHN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

export default app;

/*
=== FIRESTORE SECURITY RULES ===
Copy these rules to your Firestore Rules tab:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to get user role
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    
    // Helper function to check if user is admin
    function isAdmin() {
      return isAuthenticated() && getUserRole() == 'admin';
    }
    
    // Helper function to check if user is admin or marker
    function isAdminOrMarker() {
      return isAuthenticated() && (getUserRole() == 'admin' || getUserRole() == 'marker');
    }
    
    // Users collection - stores user roles
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
    // Members collection
    match /members/{memberId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    // Families collection
    match /families/{familyId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    // Events collection
    match /events/{eventId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    // Attendance collection
    match /attendance/{attendanceId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    // FollowUp collection
    match /followups/{followupId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if isAdmin();
    }
    
    // Teams collection (legacy)
    match /teams/{teamId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
    // Team Groups collection (hierarchical teams)
    match /team_groups/{groupId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
  }
}
*/
