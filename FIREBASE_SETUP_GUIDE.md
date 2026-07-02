# Firebase Setup Guide for Immanuel AG Church App

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `immanuel-ag-church`
4. Disable Google Analytics (optional, but recommended for simplicity)
5. Click "Create project"

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Email/Password**
3. Toggle "Enable" and click "Save"

## Step 3: Create Users in Firebase Auth

1. Go to **Authentication** > **Users**
2. Click "Add user"
3. Create your admin user:
   - Email: `admin@immanuelag.com`
   - Password: (your secure password)
4. Note the **User UID** - you'll need it for Step 5

## Step 4: Create Firestore Database

1. Go to **Firestore Database**
2. Click "Create database"
3. Select "Start in production mode"
4. Choose your region (closest to your users)
5. Click "Enable"

## Step 5: Set Up User Roles in Firestore

1. In Firestore, click "Start collection"
2. Collection ID: `users`
3. Document ID: (paste the User UID from Step 3)
4. Add these fields:
   ```
   name: "Admin User" (string)
   email: "admin@immanuelag.com" (string)
   role: "admin" (string)
   team: "" (string, optional - for area_leader role)
   ```

5. Repeat for other users with roles:
   - `admin` - Full access
   - `marker` - Can mark attendance, view members
   - `area_leader` - Can view their team and follow-ups

## Step 6: Set Up Firestore Security Rules

1. Go to **Firestore Database** > **Rules**
2. Replace with these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    
    function isAdmin() {
      return isAuthenticated() && getUserRole() == 'admin';
    }
    
    function isAdminOrMarker() {
      return isAuthenticated() && (getUserRole() == 'admin' || getUserRole() == 'marker');
    }
    
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
    match /members/{memberId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    match /families/{familyId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    match /events/{eventId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    match /attendance/{attendanceId} {
      allow read: if isAuthenticated();
      allow create, update: if isAdminOrMarker();
      allow delete: if isAdmin();
    }
    
    match /followups/{followupId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if isAdmin();
    }
    
    match /teams/{teamId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
  }
}
```

3. Click "Publish"

## Step 7: Get Firebase Config

1. Go to **Project Settings** (gear icon)
2. Scroll to "Your apps" section
3. Click the **Web** icon (`</>`)
4. Register app with nickname: `immanuel-ag-web`
5. Copy the `firebaseConfig` object

## Step 8: Update Your App

1. Open `src/lib/firebase.ts`
2. Replace the placeholder config with your actual config:

```typescript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "immanuel-ag-church.firebaseapp.com",
  projectId: "immanuel-ag-church",
  storageBucket: "immanuel-ag-church.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 9: Initialize Collections (Optional)

Create these collections with sample documents to get started:

### teams collection
```json
{
  "name": "Team A"
}
```

### members collection
```json
{
  "memberId": "IAG00001",
  "name": "John Abraham",
  "dob": "1985-03-15",
  "gender": "male",
  "phone": "+91 98765 43210",
  "address": {
    "place": "12, Faith Street",
    "city": "Chennai",
    "district": "Chennai",
    "state": "Tamil Nadu",
    "country": "India",
    "pincode": "600001"
  },
  "memberType": "individual",
  "maritalStatus": "married",
  "baptismStatus": "baptized",
  "churchRole": "volunteer",
  "team": "Team A",
  "createdAt": (Timestamp),
  "updatedAt": (Timestamp)
}
```

## Firestore Data Structure

```
firestore/
├── users/                    # User authentication roles
│   └── {userId}
│       ├── name: string
│       ├── email: string
│       ├── role: "admin" | "marker" | "area_leader"
│       └── team: string (for area_leader)
│
├── members/                  # Church members
│   └── {memberId}
│       ├── memberId: string (IAG format)
│       ├── name: string
│       ├── dob: string
│       ├── gender: string
│       ├── phone: string
│       ├── address: object
│       ├── memberType: string
│       ├── familyId: string (optional)
│       ├── familyRole: string (optional)
│       ├── maritalStatus: string
│       ├── baptismStatus: string
│       ├── churchRole: string
│       ├── team: string
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── families/                 # Family groupings
│   └── {familyId}
│       ├── name: string
│       ├── headMemberId: string
│       ├── members: array<string>
│       └── createdAt: timestamp
│
├── events/                   # Church events
│   └── {eventId}
│       ├── name: string
│       ├── date: string
│       ├── description: string
│       └── createdAt: timestamp
│
├── attendance/               # Attendance records
│   └── {attendanceId}
│       ├── eventId: string
│       ├── memberId: string
│       ├── markedAt: string
│       └── markedBy: string
│
├── followups/                # Follow-up records
│   └── {followupId}
│       ├── memberId: string
│       ├── eventId: string
│       ├── status: string
│       ├── remarks: string
│       ├── updatedAt: string
│       └── updatedBy: string
│
└── teams/                    # Teams list
    └── {teamId}
        └── name: string
```

## Troubleshooting

### "Permission denied" errors
- Check that the user document exists in `users` collection with correct UID
- Verify the `role` field is spelled correctly
- Check Firestore rules are published

### "User not configured" error on login
- Create a document in `users` collection with the Firebase Auth UID as document ID
- Add `name`, `email`, and `role` fields

### Data not loading
- Check browser console for errors
- Verify Firebase config is correct
- Check internet connection
