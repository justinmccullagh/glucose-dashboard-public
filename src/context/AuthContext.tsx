import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { auth } from '../firebase/config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  onUserAuthenticated?: (callback: (user: User) => void) => void;
  onUserSignedOut?: (callback: () => void) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Convert Firebase user to our User interface
const convertFirebaseUser = (firebaseUser: FirebaseUser): User => {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User'
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authCallbacks = useRef<{
    onUserAuthenticated?: (user: User) => void;
    onUserSignedOut?: () => void;
  }>({});

  // Login function
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = convertFirebaseUser(userCredential.user);
      setUser(user);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // Register function
  const register = async (email: string, password: string): Promise<boolean> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = convertFirebaseUser(userCredential.user);
      setUser(user);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      // Call signout callback before clearing user state
      if (authCallbacks.current.onUserSignedOut) {
        authCallbacks.current.onUserSignedOut();
      }
      
      await signOut(auth);
      setUser(null);
      setIsAuthenticated(false);
      
      // Force a complete state reset by reloading the page
      // This ensures all component states are cleared
      setTimeout(() => {
        window.location.href = '/signin';
      }, 100);
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: force redirect even if there's an error
      window.location.href = '/signin';
    }
  };

  // Check authentication status on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const user = convertFirebaseUser(firebaseUser);
        setUser(user);
        setIsAuthenticated(true);
        
        // Call authentication callback if user is being restored or logged in
        if (authCallbacks.current.onUserAuthenticated) {
          authCallbacks.current.onUserAuthenticated(user);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    register,
    logout,
    loading,
    onUserAuthenticated: (callback: (user: User) => void) => {
      authCallbacks.current.onUserAuthenticated = callback;
    },
    onUserSignedOut: (callback: () => void) => {
      authCallbacks.current.onUserSignedOut = callback;
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};