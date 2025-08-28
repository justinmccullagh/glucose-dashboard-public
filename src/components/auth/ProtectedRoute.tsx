import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [extendedLoading, setExtendedLoading] = useState(false);

  // Check if we're returning from OAuth success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('oauth') === 'success' && !isAuthenticated && !loading) {
      // Give Firebase Auth extra time to restore session after OAuth redirect
      setExtendedLoading(true);
      const timer = setTimeout(() => {
        setExtendedLoading(false);
      }, 3000); // Wait 3 seconds for auth to restore

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, loading]);

  // Show loading spinner while checking authentication
  if (loading || extendedLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-xl text-gray-600 dark:text-gray-400 mt-4">
            {extendedLoading ? 'Completing OAuth...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to sign in
  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  // If authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;