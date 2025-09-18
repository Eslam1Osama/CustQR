import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Handle browser extension connection errors gracefully
window.addEventListener('unhandledrejection', (event) => {
  // Check if the error is from browser extensions
  if (event.reason?.message?.includes('Could not establish connection') ||
      event.reason?.message?.includes('Receiving end does not exist') ||
      event.reason?.message?.includes('Extension context invalidated')) {
    // Prevent the error from appearing in console for extension-related issues
    event.preventDefault();
    // Optionally log in development mode only
    if (process.env.NODE_ENV === 'development') {
      console.debug('Browser extension connection error (suppressed):', event.reason?.message);
    }
  }
});

// Handle other unhandled promise rejections
window.addEventListener('error', (event) => {
  // Filter out common extension-related errors
  if (event.message?.includes('Non-Error promise rejection captured') ||
      event.message?.includes('Extension context invalidated')) {
    event.preventDefault();
    if (process.env.NODE_ENV === 'development') {
      console.debug('Extension-related error (suppressed):', event.message);
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
