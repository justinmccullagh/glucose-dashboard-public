# Glucose Dashboard

A modern blood glucose monitoring dashboard built with React, TypeScript, and Firebase. The application supports real-time glucose data visualization from both Google Sheets and Dexcom G7 CGM systems.

![Glucose Dashboard](https://img.shields.io/badge/Status-Active-green)
![React](https://img.shields.io/badge/React-19.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Firebase](https://img.shields.io/badge/Firebase-11.10-orange)

<img width="1912" height="1016" alt="image" src="https://github.com/user-attachments/assets/c7237805-6760-45eb-88e1-73f0f523857f" />
<img width="1898" height="1021" alt="image" src="https://github.com/user-attachments/assets/98a88071-c5ec-4c19-b2d6-f2d04aba89cf" />


## Features

- **Real-time Glucose Monitoring**: Live data visualization with automatic updates
- **Dual Data Sources**: Support for both Google Sheets and Dexcom G7 integration
- **Interactive Charts**: ApexCharts-powered glucose trend and scatter plot visualization
- **Time Range Filtering**: Last 12 readings, Last Week, Last Month, Last 3 Months views
- **Calendar View**: Full calendar integration with daily glucose summaries using FullCalendar
- **Glucose Statistics**: Average, time in range, estimated HbA1c calculations
- **Pattern Analysis**: Monthly glucose patterns overlay with scatter chart visualization
- **Dark/Light Theme**: Modern UI with theme switching
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Authentication**: Secure Firebase Authentication with protected routes
- **Real-time Updates**: Firestore-powered live data synchronization
- **Dual Dashboard**: Separate dashboards for Google Sheets and Dexcom data sources

## Architecture

### Core Technologies
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS v4 with custom theme
- **Charts**: ApexCharts for data visualization
- **Calendar**: FullCalendar for calendar view
- **Routing**: React Router v7 for client-side routing
- **Backend**: Firebase Functions (Node.js 20)
- **Database**: Cloud Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Date Handling**: date-fns library

### Data Sources
1. **Google Sheets**: Direct API integration for manual glucose logs
2. **Dexcom G7**: OAuth-authenticated real-time CGM data

## Quick Start

### Prerequisites

- Node.js 20+
- Firebase CLI
- Google Cloud Project
- (Optional) Dexcom Developer Account

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd glucose-dashboard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (see setup sections below).

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   Open [http://localhost:5173](http://localhost:5173)

## Data Source Setup

### Option 1: Google Sheets Integration

#### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google Sheets API
4. Create credentials (API Key)

#### 2. Prepare Google Sheet
1. Create a new Google Sheet
2. Name the sheet tab: `2025_all_data`
3. Set up columns:
   - Column A: Date/Time (e.g., "1/9/2025 14:30")
   - Column B: Glucose Level (mg/dL, e.g., "125")
   - Column C: Comment (optional, e.g., "after meal")
   - Column D: Day Average (optional, e.g., "130")

#### 3. Configure Sharing
1. Share the Google Sheet with "Anyone with the link can view"
2. Copy the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

#### 4. Environment Configuration
Add to your `.env` file:
```env
# Google Sheets Configuration
VITE_GOOGLE_API_KEY=your_google_api_key_here
VITE_SPREADSHEET_ID=your_spreadsheet_id_here
```

#### Example Google Sheet Data Format:
```
Date/Time          | Glucose Level | Comment      | Day Average
1/9/2025 14:30     | 125          | after meal   | 130
1/9/2025 11:15     | 98           | fasting      | 130
1/9/2025 8:00      | 102          | morning      | 130
```

### Option 2: Dexcom G7 Integration

#### 1. Dexcom Developer Setup
1. Create account at [Dexcom Developer Portal](https://developer.dexcom.com/)
2. Create a new application with these settings:
   - **Application Type**: Web Application
   - **Redirect URI**: `https://your-project.cloudfunctions.net/dexcomOAuthCallback`
   - **Scopes**: `offline_access`
3. Note your Client ID and Client Secret

#### 2. Firebase Project Setup
1. Create Firebase project at [Firebase Console](https://console.firebase.com/)
2. Enable Authentication (Email/Password provider)
3. Enable Cloud Firestore
4. Enable Firebase Functions
5. Upgrade to Blaze plan (required for Functions)

#### 3. Firebase CLI Setup
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and initialize
firebase login
firebase init

# Select:
# - Functions (JavaScript/TypeScript)
# - Firestore
# - Hosting
```

#### 4. Environment Variables

**Option A: Using Environment Variables (Recommended)**
```bash
# Set environment variables for Functions
echo "DEXCOM_CLIENT_ID=your_client_id
DEXCOM_CLIENT_SECRET=your_client_secret
DEXCOM_REDIRECT_URI=https://your-project.cloudfunctions.net/dexcomOAuthCallback
DEXCOM_USE_SANDBOX=false
DEXCOM_FRONTEND_URL=http://localhost:5173" > functions/.env
```

**Option B: Using Firebase Config (Legacy)**
```bash
# Set Dexcom credentials
firebase functions:config:set dexcom.client_id="your_dexcom_client_id"
firebase functions:config:set dexcom.client_secret="your_dexcom_client_secret"
firebase functions:config:set dexcom.redirect_uri="https://your-project.cloudfunctions.net/dexcomOAuthCallback"
firebase functions:config:set dexcom.use_sandbox="false"
firebase functions:config:set dexcom.frontend_url="http://localhost:5173"
```

#### 5. Firebase Configuration
Create `src/firebase/config.ts`:
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
```

#### 6. Deploy Firebase Functions
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

#### 7. Update Dexcom Developer Portal
Update your Dexcom application's redirect URI to match your deployed function:
```
https://your-project.cloudfunctions.net/dexcomOAuthCallback
```

#### 8. Firestore Security Rules
The application includes pre-configured security rules in `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own Dexcom tokens
    match /dexcomTokens/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Server-side only
    }
    
    // Users can only read their own glucose data
    match /glucoseReadings/{readingId} {
      allow read: if request.auth != null 
                  && resource.data.userId == request.auth.uid;
      allow write: if false; // Server-side only
    }
  }
}
```

Deploy the rules:
```bash
firebase deploy --only firestore:rules
```

## Authentication Setup

### Firebase Authentication
1. **Enable Email/Password authentication** in Firebase Console
2. **Create user accounts** through the app's sign-up page
3. **Optional**: Enable Google Sign-In for easier access

### Dexcom OAuth Flow
1. User clicks "Connect to Dexcom" in the app
2. Redirected to Dexcom for authorization
3. Firebase Function handles the OAuth callback
4. Tokens stored securely in Firestore
5. Automatic token refresh ensures continuous access

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start Vite dev server
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run ESLint

# Firebase Functions
cd functions
npm run build           # Compile TypeScript
npm run serve           # Start local emulator
npm run deploy          # Deploy to Firebase
npm run logs            # View function logs
```

### Project Structure

```
glucose-dashboard/
├── src/
│   ├── components/         # React components
│   │   ├── auth/          # Authentication components
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── SignInForm.tsx
│   │   ├── common/        # Shared components
│   │   │   ├── PageMeta.tsx
│   │   │   ├── ScrollToTop.tsx
│   │   │   ├── ThemeToggleButton.tsx
│   │   │   └── GridShape.tsx
│   │   ├── dashboard/     # Glucose dashboard components
│   │   │   ├── GlucoseMetrics.tsx
│   │   │   ├── GlucoseTrendChart.tsx
│   │   │   ├── GlucoseScatterChart.tsx
│   │   │   ├── RecentReadings.tsx
│   │   │   └── GlucoseInsights.tsx
│   │   ├── form/          # Form components
│   │   │   └── input/
│   │   │       └── InputField.tsx
│   │   ├── header/        # Header components
│   │   │   └── Header.tsx
│   │   └── ui/            # Base UI components
│   │       └── modal/
│   │           └── index.tsx
│   ├── context/           # React contexts
│   │   ├── AuthContext.tsx
│   │   ├── DexcomContext.tsx
│   │   ├── GlucoseContext.tsx
│   │   ├── SidebarContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/             # Custom hooks
│   │   ├── useCalendarData.ts
│   │   └── useModal.ts
│   ├── icons/             # SVG icons
│   │   └── index.ts       # Icon exports
│   ├── layout/            # Layout components
│   │   ├── AppLayout.tsx
│   │   ├── AppHeader.tsx
│   │   ├── AppSidebar.tsx
│   │   └── Backdrop.tsx
│   ├── pages/             # Page components
│   │   ├── AuthPages/
│   │   │   ├── AuthPageLayout.tsx
│   │   │   └── SignIn.tsx
│   │   ├── Dashboard/
│   │   │   ├── Home.tsx   # Main dashboard
│   │   │   └── Dexcom.tsx # Dexcom-specific page
│   │   ├── OtherPage/
│   │   │   └── NotFound.tsx
│   │   └── Calendar.tsx   # Calendar view
│   ├── services/          # API services
│   │   ├── googleSheets.ts
│   │   └── dexcom.ts
│   └── firebase/          # Firebase configuration
│       └── config.ts
├── functions/             # Firebase Functions
│   └── src/
│       └── index.ts       # Cloud Functions code
├── public/               # Static assets
├── firebase.json         # Firebase configuration
├── firestore.rules       # Security rules
├── CLAUDE.md            # Development guidelines
├── DEXCOM_SETUP.md      # Dexcom setup instructions
├── FIREBASE.md          # Firebase setup instructions
└── package.json
```

### Key Components

#### Dashboard (`pages/Dashboard/Home.tsx`)
- Time range filtering buttons (Last 12 readings, Last Week, Last Month, Last 3 Months)
- Real-time glucose metrics cards
- Interactive ApexCharts visualization
- Responsive grid layout
- Context-based refresh button (hidden on Dexcom page)

#### Dexcom Integration (`pages/Dashboard/Dexcom.tsx`)
- OAuth connection flow
- Real-time Firestore data
- Connection status monitoring
- Built-in manual refresh capabilities
- Dedicated time range filtering for Dexcom data

#### Calendar View (`pages/Calendar.tsx`)
- Full calendar integration with FullCalendar
- Daily glucose summaries with color-coded status
- Interactive event details modal
- Pattern recognition for high/low glucose days

#### Key Dashboard Components
- **GlucoseMetrics**: Real-time glucose statistics cards (average, time in range, HbA1c)
- **GlucoseTrendChart**: Interactive line chart for glucose trends with dual data series
- **GlucoseScatterChart**: Monthly pattern overlay scatter plot for last 90 days
- **RecentReadings**: Table of recent glucose readings with status indicators
- **GlucoseInsights**: Range distribution analysis with progress bars

#### Context Providers
- **GlucoseContext**: Google Sheets data management with filtering and statistics
- **DexcomContext**: Dexcom data, authentication, and OAuth flow management
- **ThemeContext**: Dark/light mode switching with localStorage persistence
- **AuthContext**: Firebase Authentication with user session management
- **SidebarContext**: Responsive sidebar state management

## Data Flow

### Google Sheets Flow
1. **Data Entry**: Manual entry in Google Sheet
2. **API Fetch**: Frontend calls Google Sheets API
3. **Processing**: Data transformed and filtered
4. **Display**: Real-time charts and statistics

### Dexcom G7 Flow
1. **OAuth**: User authorizes app with Dexcom
2. **Token Storage**: Secure server-side token management
3. **Data Fetch**: Firebase Functions call Dexcom API
4. **Firestore**: Data stored in Cloud Firestore
5. **Real-time**: Frontend subscribes to Firestore updates
6. **Display**: Live glucose monitoring dashboard

## Performance & Optimization

### Rate Limiting
- **Google Sheets**: 100 requests per 100 seconds per user
- **Dexcom API**: 60,000 requests per hour (monitored automatically)

### Caching Strategy
- **Google Sheets**: Client-side caching with manual refresh
- **Dexcom**: Server-side Firestore storage with real-time updates
- **Firebase Functions**: Automatic token refresh and rate limiting

### Chart Optimization
- **ApexCharts Configuration**: Optimized for responsive behavior without unwanted scrollbars
- **Container Sizing**: Simplified chart containers to prevent dynamic resizing issues
- **Redraw Handling**: Automatic chart redrawing on window/parent resize events
- **Memory Management**: Efficient chart data processing and filtering

### Cost Optimization
For personal use (~288 readings/day):
- **Firebase Functions**: ~$0.003/month
- **Firestore**: ~$0.01/month
- **Firebase Hosting**: Free tier
- **Total**: <$0.05/month (likely free tier)

## Security Features

### Data Protection
- **Authentication**: Firebase Auth required for all operations
- **User Isolation**: Users can only access their own data
- **Server-side Tokens**: Dexcom tokens never exposed to frontend
- **Encrypted Storage**: Sensitive data encrypted in Firestore

### Security Rules
- Read access limited to authenticated users' own data
- Write access restricted to server-side functions only
- Rate limiting and request validation
- HTTPS-only communication

## Troubleshooting

### Google Sheets Issues

**Error: "API key invalid"**
- Verify API key in Google Cloud Console
- Ensure Google Sheets API is enabled
- Check spreadsheet sharing permissions

**Error: "No data found"**
- Verify spreadsheet ID in URL
- Check sheet name is `2025_all_data`
- Ensure data is in columns A-D

### Dexcom Issues

**Error: "Token exchange failed"**
- Verify Dexcom API credentials
- Check redirect URI matches deployed function
- Ensure using sandbox mode for testing

**Error: "No glucose data"**
- Verify Dexcom connection status
- Check date ranges (sandbox has limited data)
- Review Firebase Functions logs: `firebase functions:log`

**CORS Errors**
- Ensure proper domain whitelisting
- Verify Firebase Functions deployment
- Check browser console for detailed errors

### Firebase Issues

**Functions deployment fails:**
```bash
# Check Node.js version
node --version  # Should be 20+

# Clear dependencies and reinstall
cd functions
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Firestore permission denied:**
```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Verify user authentication
# Check browser console for auth errors
```

## Testing

### Local Development
```bash
# Start Firebase emulators
firebase emulators:start

# Run with emulators
npm run dev
```

### Production Testing
```bash
# Test Google Sheets integration
# Add test data to your sheet and verify display

# Test Dexcom integration
# Use sandbox environment first
# Check /dexcom page for connection status
```

## Monitoring

### Health Metrics
Firebase Functions automatically log:
- API response times
- Success/failure rates
- Rate limit status
- Error details

### Access Logs
```bash
# View function logs
firebase functions:log

# Filter by function
firebase functions:log --only dexcomFetchGlucoseData
```

## Deployment

### Firebase Hosting
```bash
# Build and deploy
npm run build
firebase deploy
```

### Production Environment

1. **Update environment variables:**
   ```bash
   # Switch to production Dexcom API
   DEXCOM_USE_SANDBOX=false
   DEXCOM_FRONTEND_URL=https://your-domain.web.app
   ```

2. **Apply for Dexcom production access**
3. **Update redirect URI** in Dexcom Developer Portal
4. **Deploy security rules** and functions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

- **Issues**: Report bugs via GitHub Issues
- **Documentation**: See `CLAUDE.md` for development guidelines
- **Dexcom Setup**: See `DEXCOM_SETUP.md` for detailed instructions
- **Firebase Setup**: See `FIREBASE.md` for Firebase configuration

## Development Notes

### Current Implementation Status
- Main dashboard uses Google Sheets data with time range filtering
- Dedicated Dexcom dashboard with OAuth integration and real-time updates
- Calendar view provides daily glucose summaries with pattern recognition
- Responsive design with collapsible sidebar and theme switching
- Protected routes requiring Firebase Authentication

## Roadmap

- [ ] Insulin dosing tracking
- [ ] Meal logging integration  
- [ ] Historical trend analysis
- [ ] Export functionality (PDF, CSV)
- [ ] Mobile app development
- [ ] Integration with other CGM systems
- [ ] Advanced pattern recognition and alerts

---

**Built for the diabetes community**
