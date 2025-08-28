# Glucose Dashboard - Public Repository Setup

This is a cleaned public version of the glucose-dashboard project with all sensitive data removed.

## Files Structure

```
glucose-dashboard-public/
├── src/                    # React/TypeScript source code
├── public/                 # Static assets
├── functions/             # Firebase Cloud Functions
│   ├── src/               # Functions source code
│   └── .env.example       # Example environment variables
├── .env.example           # Example environment variables
├── .firebaserc.example    # Example Firebase project config
├── .gitignore             # Git ignore rules
├── firebase.json          # Firebase configuration
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Firestore indexes
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
├── eslint.config.js       # ESLint configuration
├── README.md              # Project documentation
└── DEXCOM_SETUP.md        # Dexcom integration guide
```

## Setup Instructions

1. **Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd glucose-dashboard-public
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   cp functions/.env.example functions/.env
   cp .firebaserc.example .firebaserc
   ```
   Then edit these files with your actual values.

4. **Set up Firebase**
   - Create a new Firebase project
   - Enable Authentication, Firestore, and Functions
   - Run `firebase init` and select your project
   - Deploy security rules: `firebase deploy --only firestore:rules`

5. **Set up data source**
   - For Google Sheets: Follow instructions in README.md
   - For Dexcom: Follow instructions in DEXCOM_SETUP.md

6. **Start development server**
   ```bash
   npm run dev
   ```

## Important Notes

- All API keys and sensitive data have been removed
- You must provide your own Firebase and API credentials
- Example files are provided as templates
- See README.md for complete setup instructions

## Source Code Not Included

Due to the large number of source files, the actual React/TypeScript code files are not included in this example. To get the complete source code:

1. Contact the project maintainer, or
2. Copy the following directories from the original project:
   - `/src` - All React components and TypeScript files
   - `/public` - Static assets (images, icons, etc.)
   - `/functions/src` - Firebase Functions source code

## License

MIT License - See LICENSE file for details
