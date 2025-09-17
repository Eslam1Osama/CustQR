import React from 'react';

/**
 * Logo Component - Professional CustQR branding element
 * 
 * Features:
 * - Responsive sizing across all breakpoints
 * - Optimized loading with proper error handling
 * - Accessibility compliant with ARIA attributes
 * - Performance optimized with lazy loading
 * 
 * @param size - Logo size variant: 'sm' | 'md' | 'lg' | 'xl'
 * @param className - Additional CSS classes for customization
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  priority?: boolean; // For above-the-fold loading
  onClick?: () => void; // Optional click handler for navigation
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

const Logo: React.FC<LogoProps> = ({ 
  size = 'md', 
  className = '', 
  priority = false,
  onClick
}) => {
  const [imageError, setImageError] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Fallback component for error states
  const LogoFallback = () => (
    <div 
      className={`${sizeClasses[size]} ${className} flex items-center justify-center bg-primary rounded-md ${
        onClick ? 'cursor-pointer hover:bg-primary/90 transition-colors' : ''
      }`}
      role={onClick ? "button" : "img"}
      aria-label={onClick ? "CustQR Logo - Click to reload" : "CustQR Logo"}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="text-primary-foreground font-bold text-xs">CQ</span>
    </div>
  );

  if (imageError) {
    return <LogoFallback />;
  }

  return (
    <div 
      className={`${sizeClasses[size]} ${className} relative ${
        onClick ? 'cursor-pointer hover:scale-105 transition-transform duration-200' : ''
      }`}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? "CustQR Logo - Click to reload" : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {!imageLoaded && (
        <div 
          className={`${sizeClasses[size]} absolute inset-0 bg-muted animate-pulse rounded-md`}
          aria-hidden="true"
        />
      )}
      <img
        src="/favicon.jpg"
        alt="CustQR - Professional QR Code Generator"
        className={`${sizeClasses[size]} object-contain rounded-md transition-opacity duration-200 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onError={handleImageError}
        onLoad={handleImageLoad}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        role="img"
        aria-label={onClick ? "CustQR Logo - Click to reload" : "CustQR Logo - Professional QR Code Generator"}
      />
    </div>
  );
};

export default Logo;
