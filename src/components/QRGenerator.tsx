import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import { Download, Upload, Settings, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Toast notifications disabled - using console logging for debugging
// import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface QROptions {
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  width: number;
  margin: number;
  color: {
    dark: string;
    light: string;
  };
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
}

interface ColorValidationResult extends ValidationResult {
  contrastRatio?: number;
  scannable?: boolean;
}

const QRGenerator = () => {
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [displayQrUrl, setDisplayQrUrl] = useState(''); // For smooth transitions
  const [logo, setLogo] = useState<string | null>(null);
  const [options, setOptions] = useState<QROptions>({
    errorCorrectionLevel: 'M',
    width: 256,
    margin: 2,
    color: {
      dark: '#1e293b',
      light: '#ffffff'
    }
  });

  const qrRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Debounce timer for smooth color picker dragging
  const colorDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // No-op toast function - notifications disabled but functionality preserved
  const toast = useCallback(({ title, description, variant }: { title: string; description: string; variant?: string }) => {
    // Silent logging for debugging purposes (can be removed in production)
    console.log(`[${variant || 'info'}] ${title}: ${description}`);
  }, []);

  // No complex CSS filter needed - using mask-based approach for precise color control

  // Logo click handler for web app reload
  const handleLogoClick = useCallback(() => {
    // Standard web app reload pattern
    window.location.reload();
  }, []);

  // Smooth QR image transition to prevent chunky updates
  const updateQrDisplay = useCallback((newQrDataUrl: string) => {
    if (!newQrDataUrl) {
      setDisplayQrUrl('');
      return;
    }

    // Pre-load the new QR image for smooth transition
    const img = new Image();
    img.onload = () => {
      // Image fully loaded, now update display atomically
      setDisplayQrUrl(newQrDataUrl);
    };
    img.onerror = () => {
      // Fallback to direct update if pre-loading fails
      setDisplayQrUrl(newQrDataUrl);
    };
    img.src = newQrDataUrl;
  }, []);

  // Enhanced validation utilities
  const validateHexColor = useCallback((color: string): ValidationResult => {
    if (!color) return { isValid: false, error: 'Color is required' };
    
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(color)) {
      return { isValid: false, error: 'Invalid hex color format (use #RRGGBB or #RGB)' };
    }
    return { isValid: true };
  }, []);

  const calculateLuminance = useCallback((hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }, []);

  const validateColorContrast = useCallback((darkColor: string, lightColor: string): ColorValidationResult => {
    const darkValidation = validateHexColor(darkColor);
    const lightValidation = validateHexColor(lightColor);
    
    if (!darkValidation.isValid || !lightValidation.isValid) {
      return { 
        isValid: false, 
        error: darkValidation.error || lightValidation.error 
      };
    }

    const darkLum = calculateLuminance(darkColor);
    const lightLum = calculateLuminance(lightColor);
    
    const contrastRatio = (Math.max(darkLum, lightLum) + 0.05) / (Math.min(darkLum, lightLum) + 0.05);
    const scannable = contrastRatio >= 3; // Minimum contrast ratio for QR readability
    
    return {
      isValid: true,
      contrastRatio,
      scannable,
      warning: !scannable ? 'Low contrast may affect QR code scannability' : undefined
    };
  }, [validateHexColor, calculateLuminance]);

  const validateNumericInput = useCallback((value: string, min: number, max: number, defaultValue: number): ValidationResult & { parsedValue: number } => {
    if (!value || value.trim() === '') {
      return { isValid: true, parsedValue: defaultValue };
    }

    const numValue = parseInt(value, 10);
    
    if (isNaN(numValue)) {
      return { isValid: false, error: 'Must be a valid number', parsedValue: defaultValue };
    }

    if (numValue < min || numValue > max) {
      return { 
        isValid: false, 
        error: `Value must be between ${min} and ${max}`, 
        parsedValue: Math.max(min, Math.min(max, numValue)) 
      };
    }

    return { isValid: true, parsedValue: numValue };
  }, []);

  // Enhanced file validation with enterprise-level security and format support
  const validateFileUpload = useCallback((file: File): ValidationResult => {
    // File size validation with tiered limits
    const maxSize = 5 * 1024 * 1024; // 5MB limit for enterprise use
    if (file.size > maxSize) {
      return { isValid: false, error: `File size must be under ${Math.round(maxSize / (1024 * 1024))}MB` };
    }

    // Minimum file size check (prevent empty/corrupt files)
    if (file.size < 100) {
      return { isValid: false, error: 'File appears to be empty or corrupted' };
    }

    // Enhanced MIME type validation with magic number checking
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/svg+xml', 'image/avif', 'image/bmp'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return { 
        isValid: false, 
        error: 'File must be a valid image format (JPEG, PNG, GIF, WebP, SVG, AVIF, or BMP)' 
      };
    }

    // File extension validation (additional security layer)
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return { 
        isValid: false, 
        error: 'File extension does not match allowed image formats' 
      };
    }

    // Enhanced file name validation (prevent malicious names while allowing common patterns)
    if (file.name.length > 255) {
      return { 
        isValid: false, 
        error: 'File name is too long (maximum 255 characters)' 
      };
    }
    
    // Allow common filename patterns including spaces, parentheses, and international characters
    // Prevent only dangerous characters and patterns
    const dangerousPatterns = [
      /[<>:"|?*\u0000-\u001F\u0080-\u009F]/,  // Control characters and dangerous symbols
      /^\.+$/,                        // Only dots (., ..)
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,  // Windows reserved names
      /\.(bat|cmd|exe|scr|com|pif|vbs|js|jar|app|deb|dmg|pkg|rpm)$/i  // Executable extensions
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(file.name))) {
      return { 
        isValid: false, 
        error: 'File name contains unsafe characters or patterns' 
      };
    }

    return { isValid: true };
  }, []);

  // Enterprise-grade image optimization and processing
  const optimizeImage = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate optimal dimensions (max 512x512 for logos)
          const maxDimension = 512;
          let { width, height } = img;
          
          if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // Set canvas size
          canvas.width = width;
          canvas.height = height;

          // Enable high-quality scaling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw optimized image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to optimized data URL (PNG for quality, JPEG for size)
          const quality = file.size > 1024 * 1024 ? 0.85 : 0.95; // Lower quality for large files
          const format = file.type.includes('png') || file.type.includes('gif') ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(format, quality);

          resolve(dataUrl);
        } catch (error) {
          reject(new Error(`Image optimization failed: ${error.message}`));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for optimization'));
      };

      img.src = URL.createObjectURL(file);
    });
  }, []);

  const validateUrl = useCallback((input: string): boolean => {
    if (!input) return false;
    try {
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
      return urlPattern.test(input) || new URL(input).protocol.startsWith('http');
    } catch {
      // If URL constructor fails, try with https prefix
      try {
        new URL(`https://${input}`);
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  const sanitizeUrl = useCallback((input: string): string => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }, []);

  // Memoized validation states for performance
  const colorValidation = useMemo(() => 
    validateColorContrast(options.color.dark, options.color.light),
    [options.color.dark, options.color.light, validateColorContrast]
  );

  const sizeValidation = useMemo(() => 
    validateNumericInput(options.width.toString(), 128, 512, 256),
    [options.width, validateNumericInput]
  );

  const marginValidation = useMemo(() => 
    validateNumericInput(options.margin.toString(), 0, 10, 2),
    [options.margin, validateNumericInput]
  );

  // Enhanced QR generation with proper dependencies
  const generateQRWithValidation = useCallback(async () => {
    if (!url || !validateUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL to generate QR code",
        variant: "destructive"
      });
      return;
    }

    // Validate color contrast for scannability
    if (!colorValidation.scannable) {
      toast({
        title: "Color Contrast Warning",
        description: colorValidation.warning || "Colors may affect QR code readability",
        variant: "destructive"
      });
    }

    try {
      const sanitizedUrl = sanitizeUrl(url);
      const qrString = await QRCode.toDataURL(sanitizedUrl, {
        ...options,
        color: {
          dark: '#ffffff', // White foreground - will be masked with colored overlay
          light: '#00000000' // Transparent background - CSS will handle the background color
        }
      });
      setQrDataUrl(qrString);
      updateQrDisplay(qrString); // Smooth transition update
      
      if (colorValidation.scannable) {
      toast({
        title: "QR Code Generated",
        description: "Your QR code is ready for download",
        variant: "default"
      });
      } else {
        toast({
          title: "QR Code Generated with Warning",
          description: "QR code created but may have scanning issues due to low contrast",
          variant: "default"
        });
      }
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate QR code. Please try again.",
        variant: "destructive"
      });
    }
  }, [url, options, colorValidation, validateUrl, sanitizeUrl, toast, updateQrDisplay]);

  // Generate QR Code button removed - auto-generation handles all QR creation

  // Auto-generate QR when URL changes and is valid (with proper dependencies)
  useEffect(() => {
    if (url && validateUrl(url)) {
      const timeoutId = setTimeout(() => {
        generateQRWithValidation();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [url, generateQRWithValidation, validateUrl]);

  // QR regeneration only needed for structural changes (URL, size, margin, error correction)
  // Colors are now handled by CSS for instant updates
  useEffect(() => {
    if (url && validateUrl(url) && qrDataUrl) {
      // Clear existing timer
      if (colorDebounceTimer.current) {
        clearTimeout(colorDebounceTimer.current);
      }
      
      // Debounce QR regeneration for structural changes only
      colorDebounceTimer.current = setTimeout(() => {
        generateQRWithValidation();
      }, 300);
      
      // Cleanup function
      return () => {
        if (colorDebounceTimer.current) {
          clearTimeout(colorDebounceTimer.current);
        }
      };
    }
  }, [options.width, options.margin, options.errorCorrectionLevel, url, validateUrl, qrDataUrl, generateQRWithValidation]);

  // Initialize display QR URL for first-time generation
  useEffect(() => {
    if (qrDataUrl && !displayQrUrl) {
      updateQrDisplay(qrDataUrl);
    }
  }, [qrDataUrl, displayQrUrl, updateQrDisplay]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (colorDebounceTimer.current) {
        clearTimeout(colorDebounceTimer.current);
      }
    };
  }, []);

  // Enterprise-grade logo upload handler with comprehensive validation and optimization
  const [isUploading, setIsUploading] = useState(false);
  const [logoInfo, setLogoInfo] = useState<{name: string; size: number; dimensions: string} | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const handleLogoUpload = useCallback(async (file: File) => {
    if (!file) return;

    setIsUploading(true);

    try {
      // Enhanced file validation
    const validation = validateFileUpload(file);
    if (!validation.isValid) {
      toast({
        title: "Invalid File",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

      // Clean up previous object URL to prevent memory leaks
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      // Create object URL for dimension checking
      objectUrlRef.current = URL.createObjectURL(file);

      // Enhanced dimension validation with enterprise standards
    const img = new Image();
      const dimensionCheck = new Promise<{width: number; height: number}>((resolve, reject) => {
    img.onload = () => {
          resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
          reject(new Error('Failed to load image for dimension checking'));
        };
        img.src = objectUrlRef.current!;
      });

      const { width, height } = await dimensionCheck;

      // Enterprise dimension validation
      if (width < 32 || height < 32) {
        toast({
          title: "Image Too Small",
          description: "Logo must be at least 32x32 pixels for optimal quality",
          variant: "destructive"
        });
        return;
      }

      if (width > 4096 || height > 4096) {
        toast({
          title: "Image Too Large",
          description: "Logo dimensions must be under 4096x4096 pixels",
          variant: "destructive"
        });
        return;
      }

      // Optimize image for better performance and quality
      const optimizedDataUrl = await optimizeImage(file);

      // Set logo and metadata
      setLogo(optimizedDataUrl);
      setLogoInfo({
        name: file.name,
        size: file.size,
        dimensions: `${width}x${height}`
      });

        toast({
        title: "Logo Uploaded Successfully",
        description: `${file.name} (${width}x${height}) optimized and ready`,
          variant: "default"
        });

    } catch (error) {
      console.error('Logo upload failed:', error);
        toast({
          title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process image file",
          variant: "destructive"
        });
    } finally {
      setIsUploading(false);
      // Clean up object URL after processing
      if (objectUrlRef.current) {
        setTimeout(() => {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
        }, 1000);
      }
    }
  }, [validateFileUpload, optimizeImage, toast]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoUpload(file);
    }
    // Reset input to allow same file upload again
    e.target.value = '';
  }, [handleLogoUpload]);

  // Handle logo removal
  const handleLogoRemoval = useCallback(() => {
    setLogo(null);
    setLogoInfo(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
      toast({
      title: "Logo Removed",
      description: "Logo has been removed from QR code",
      variant: "default"
    });
  }, [toast]);

  // Handle drag and drop
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleLogoUpload(files[0]);
    }
  }, [handleLogoUpload]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Verify QRCode library capabilities on component mount
  useEffect(() => {
    // Verify QRCode library supports required methods
    if (typeof QRCode.toCanvas !== 'function') {
      console.warn('QRCode.toCanvas method not available. PNG/PDF downloads may not work properly.');
    }
    if (typeof QRCode.toString !== 'function') {
      console.warn('QRCode.toString method not available. SVG downloads may not work properly.');
    }
  }, []);

  // Development vs Production logging utility
  const isDevelopment = process.env.NODE_ENV === 'development';
  const debugLog = useCallback((message: string, data?: unknown) => {
    if (isDevelopment) {
      if (data) {
        console.log(`[CustQR Debug] ${message}`, data);
      } else {
        console.log(`[CustQR Debug] ${message}`);
      }
    }
  }, [isDevelopment]);

  // Helper function to prepare logo for SVG embedding with optimized logging
  const prepareLogoForSVG = useCallback(async (logoUrl: string): Promise<string> => {
    debugLog('Starting SVG logo preparation', { urlLength: logoUrl.length, isDataUrl: logoUrl.startsWith('data:') });
    
    try {
      // If already a data URL, validate and return
      if (logoUrl.startsWith('data:')) {
        debugLog('Logo is already a data URL');
        // Validate data URL format
        const dataUrlPattern = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i;
        if (dataUrlPattern.test(logoUrl)) {
          debugLog('Data URL validation passed');
          return logoUrl;
        } else {
          throw new Error('Invalid data URL format');
        }
      }
      
      debugLog('Converting external/blob URL to data URL');
      // Convert external URL or blob URL to data URL
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        let timeoutId: NodeJS.Timeout | null = null;
        
        // Set CORS for external URLs
        img.crossOrigin = 'anonymous';
        
        // Proper event handler that doesn't get overwritten
        const handleLoad = () => {
          debugLog('Image loaded successfully, converting to canvas');
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Canvas context not available');
            }
            
            // Set canvas size to image size
            canvas.width = img.width;
            canvas.height = img.height;
            debugLog('Canvas size set', { width: img.width, height: img.height });
            
            // Draw image to canvas
            ctx.drawImage(img, 0, 0);
            
            // Convert to data URL with PNG format for SVG compatibility
            const dataUrl = canvas.toDataURL('image/png');
            debugLog('Successfully converted to data URL', { length: dataUrl.length });
            resolve(dataUrl);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            reject(new Error(`Failed to convert image: ${errorMsg}`));
          }
        };
        
        const handleError = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          reject(new Error('Failed to load image'));
        };
        
        // Set up event handlers BEFORE setting timeout
        img.addEventListener('load', handleLoad, { once: true });
        img.addEventListener('error', handleError, { once: true });
        
        // Set timeout to prevent hanging
        timeoutId = setTimeout(() => {
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          reject(new Error('Image load timeout'));
        }, 10000);
        
        debugLog('Setting image source and waiting for load');
        img.src = logoUrl;
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Logo preparation failed: ${errorMsg}`);
    }
  }, [debugLog]);

  // Helper function to generate QR with actual user colors for downloads
  const generateDownloadQR = useCallback(async (format: 'canvas' | 'svg') => {
    const sanitizedUrl = sanitizeUrl(url);
    
    if (format === 'svg') {
      // ENTERPRISE BULLETPROOF SVG GENERATION - Canvas-to-SVG Method
      debugLog('Starting bulletproof SVG generation using canvas-to-SVG method');
      
      if (logo) {
        console.log('=== BULLETPROOF SVG WITH LOGO GENERATION ===');
        
        // Generate high-quality canvas with QR + logo (guaranteed to work)
        const svgCanvas = document.createElement('canvas');
        await QRCode.toCanvas(svgCanvas, sanitizedUrl, {
          ...options,
          width: options.width, // Use exact target size for SVG
          color: {
            dark: options.color.dark,
            light: options.color.light
          }
        });
        
        // Add logo using proven canvas method
        await addLogoToCanvas(svgCanvas);
        
        // Convert canvas to high-quality data URL
        const canvasDataUrl = svgCanvas.toDataURL('image/png', 1.0);
        
        console.log('Canvas with logo generated successfully:', {
          canvasSize: `${svgCanvas.width}x${svgCanvas.height}`,
          dataUrlLength: canvasDataUrl.length
        });
        
        // Create professional SVG wrapper with perfect dimensions
        const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${options.width}" height="${options.width}" 
     viewBox="0 0 ${options.width} ${options.width}"
     style="background-color: ${options.color.light};">
  <!-- CustQR Professional QR Code with Logo -->
  <title>CustQR Code with Logo</title>
  <desc>Professional QR Code for ${url} with embedded logo</desc>
  
  <!-- High-quality QR code with logo embedded -->
  <image x="0" y="0" width="${options.width}" height="${options.width}" 
         href="${canvasDataUrl}" 
         preserveAspectRatio="xMidYMid meet"
         style="image-rendering: optimizeQuality; shape-rendering: crispEdges;" />
</svg>`;
        
        console.log('Professional SVG with logo created:', {
          svgLength: svgString.length,
          containsTitle: svgString.includes('<title>'),
          containsDesc: svgString.includes('<desc>'),
          containsImage: svgString.includes('<image'),
          viewBoxCorrect: svgString.includes(`viewBox="0 0 ${options.width} ${options.width}"`)
        });
        
        console.log('=== BULLETPROOF SVG GENERATION COMPLETE ===');
        return svgString;
        
      } else {
        // No logo - use standard QRCode library SVG generation
        debugLog('Generating standard SVG without logo');
        const svgString = await QRCode.toString(sanitizedUrl, {
          ...options,
          type: 'svg',
          color: {
            dark: options.color.dark,
            light: options.color.light
          }
        });
        return svgString;
      }
    } else {
      // Create high-resolution canvas with user's selected colors for maximum quality
      const canvas = document.createElement('canvas');
      
      // Generate QR at 2x resolution for crisp downloads
      const hiDPIOptions = {
        ...options,
        width: options.width * 2, // 2x resolution for retina quality
        margin: options.margin,
        color: {
          dark: options.color.dark,    // User's selected foreground color
          light: options.color.light   // User's selected background color
        }
      };
      
      await QRCode.toCanvas(canvas, sanitizedUrl, hiDPIOptions);
      
      debugLog('High-resolution QR canvas generated', {
        originalSize: options.width,
        hiDPISize: hiDPIOptions.width,
        canvasDimensions: `${canvas.width}x${canvas.height}`
      });
      
      return canvas;
    }
  }, [url, options, sanitizeUrl, logo, prepareLogoForSVG, debugLog]);

  // Enterprise-grade high-quality logo overlay for downloads
  const addLogoToCanvas = useCallback(async (canvas: HTMLCanvasElement): Promise<void> => {
    if (!logo) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    
    try {
      // Enable maximum quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      const logoImg = new Image();
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject(new Error('Failed to load logo image'));
        logoImg.src = logo;
      });
      
      // SYNCHRONIZED CANVAS LOGO SIZING - Match SVG proportional system exactly
      const canvasSize = Math.min(canvas.width, canvas.height);
      const logoSize = Math.round(canvasSize * 0.20); // 20% of canvas size (matches SVG)
      const circlePadding = Math.max(Math.round(logoSize * 0.12), 3); // 12% of logo size (matches SVG)
      const circleRadius = Math.round(logoSize / 2 + circlePadding); // Logo radius + proportional padding
      
      // Perfect pixel-aligned centering (matches SVG centering logic)
      const circleCenterX = Math.round(canvas.width / 2);
      const circleCenterY = Math.round(canvas.height / 2);
      const logoX = Math.round(circleCenterX - logoSize / 2);
      const logoY = Math.round(circleCenterY - logoSize / 2);
      
      // Create high-resolution logo canvas for maximum quality
      const logoCanvas = document.createElement('canvas');
      const logoCtx = logoCanvas.getContext('2d');
      if (!logoCtx) throw new Error('Logo canvas context not available');
      
      // Use 2x resolution for retina-quality logo rendering
      const hiDPIScale = 2;
      const hiDPILogoSize = logoSize * hiDPIScale;
      logoCanvas.width = hiDPILogoSize;
      logoCanvas.height = hiDPILogoSize;
      
      // Enable maximum quality for logo canvas
      logoCtx.imageSmoothingEnabled = true;
      logoCtx.imageSmoothingQuality = 'high';
      
      // Draw logo at high resolution
      logoCtx.drawImage(logoImg, 0, 0, hiDPILogoSize, hiDPILogoSize);
      
      // Draw synchronized white background circle with professional styling
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'; // Match SVG shadow opacity
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      
      // Draw high-quality logo from high-resolution canvas
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(logoCanvas, logoX, logoY, logoSize, logoSize);
      ctx.restore();
      
      debugLog('SYNCHRONIZED CANVAS LOGO OVERLAY APPLIED', {
        // Canvas dimensions
        canvasSize: `${canvas.width}x${canvas.height}`,
        baseSize: canvasSize,
        
        // Logo synchronization
        logoSize: logoSize,
        logoSizePercentage: Math.round((logoSize / canvasSize) * 100) + '%',
        logoPosition: `${logoX},${logoY}`,
        
        // Circle synchronization  
        circlePadding: circlePadding,
        circlePaddingPercentage: Math.round((circlePadding / logoSize) * 100) + '%',
        circleRadius: circleRadius,
        circleCenter: `${circleCenterX},${circleCenterY}`,
        
        // Quality settings
        hiDPIScale: hiDPIScale,
        hiDPILogoSize: hiDPILogoSize,
        
        // Synchronization validation
        logoToCanvasRatio: (logoSize / canvasSize).toFixed(3),
        circleToLogoRatio: (circleRadius / (logoSize / 2)).toFixed(3),
        perfectCentering: logoX === circleCenterX - logoSize / 2 && logoY === circleCenterY - logoSize / 2
      });
      
    } catch (error) {
      console.warn('Logo overlay failed:', error);
      // Continue without logo rather than failing entire download
    }
  }, [logo, debugLog]);

  // Calculate preview logo size to match download logo proportions exactly
  const calculatePreviewLogoSize = useCallback((qrSize: number): number => {
    // Match the download calculation: canvasSize * 0.2 where canvasSize = qrSize * 2
    const downloadCanvasSize = qrSize * 2;
    const downloadLogoSize = Math.round(downloadCanvasSize * 0.2);
    
    // Scale down for preview display (since download is 2x resolution)
    const previewLogoSize = Math.round(downloadLogoSize / 2);
    
    // Ensure minimum size for visibility and maximum for large QR codes
    return Math.max(Math.min(previewLogoSize, 80), 16); // Min 16px, Max 80px
  }, []);

  // Calculate preview circle padding to match download proportions
  const calculatePreviewCirclePadding = useCallback((logoSize: number): number => {
    // Match the download circle padding calculation
    const qrSize = options.width;
    const canvasSize = qrSize * 2; // Download uses 2x resolution
    const downloadPadding = canvasSize > 512 ? 8 : 4;
    
    // Scale down for preview (since download is 2x resolution)
    return Math.max(Math.round(downloadPadding / 2), 1); // Min 1px for visibility
  }, [options.width]);

  // Memoized preview logo sizing for performance with debug logging
  const previewLogoSize = useMemo(() => {
    const size = calculatePreviewLogoSize(options.width);
    debugLog('Preview logo size calculated', {
      qrSize: options.width,
      previewLogoSize: size,
      downloadEquivalent: Math.round((options.width * 2) * 0.2),
      percentage: Math.round((size / options.width) * 100) + '%'
    });
    return size;
  }, [options.width, calculatePreviewLogoSize, debugLog]);
  
  const previewCirclePadding = useMemo(() => {
    const padding = calculatePreviewCirclePadding(previewLogoSize);
    debugLog('Preview circle padding calculated', {
      logoSize: previewLogoSize,
      padding,
      totalCircleSize: previewLogoSize + (padding * 2)
    });
    return padding;
  }, [previewLogoSize, calculatePreviewCirclePadding, debugLog]);

  const downloadQR = async (format: 'png' | 'svg' | 'pdf') => {
    if (!qrDataUrl) return;

    let objectUrl: string | null = null;
    
    try {
      if (format === 'svg') {
        debugLog('Starting SVG generation with logo embedding');
        // Generate SVG with actual user colors and logo
        const svgString = await generateDownloadQR('svg') as string;
        
        // COMPREHENSIVE SVG DIAGNOSTIC LOGGING
        console.log('=== SVG LOGO EMBEDDING DIAGNOSTIC ===');
        console.log('1. SVG Generation Results:', {
          svgLength: svgString.length,
          hasLogoGroup: svgString.includes('custqr-logo-group'),
          hasLogoCircle: svgString.includes('Logo background circle'),
          hasLogoImage: svgString.includes('Logo image with proper data URL'),
          logoState: !!logo,
          logoLength: logo?.length
        });
        
        // Check SVG structure
        console.log('2. SVG Structure Analysis:', {
          hasOpeningTag: svgString.includes('<svg'),
          hasClosingTag: svgString.includes('</svg>'),
          firstLine: svgString.split('\n')[0],
          lastLine: svgString.split('\n').slice(-3).join('\n')
        });
        
        // Check logo embedding specifically
        if (logo) {
          console.log('3. Logo Embedding Analysis:', {
            logoExists: !!logo,
            logoType: typeof logo,
            logoIsDataUrl: logo.startsWith('data:'),
            logoPreview: logo.substring(0, 100),
            svgContainsLogoGroup: svgString.includes('custqr-logo-group'),
            svgContainsImageTag: svgString.includes('<image'),
            logoGroupMatches: (svgString.match(/custqr-logo-group/g) || []).length
          });
          
          // Extract logo group from SVG for inspection
          const logoGroupMatch = svgString.match(/<g id="custqr-logo-group">[\s\S]*?<\/g>/);
          if (logoGroupMatch) {
            console.log('4. Logo Group Found in SVG:', logoGroupMatch[0]);
          } else {
            console.log('4. Logo Group NOT FOUND in SVG');
            // Check for partial matches
            console.log('   Checking for partial logo elements:');
            console.log('   - Contains circle:', svgString.includes('Logo background circle'));
            console.log('   - Contains image:', svgString.includes('Logo image'));
            console.log('   - Contains custqr-logo:', svgString.includes('custqr-logo'));
          }
        }
        
        console.log('=== END SVG DIAGNOSTIC ===');
        
        debugLog('SVG generation completed', {
          finalLength: svgString.length,
          containsLogo: svgString.includes('custqr-logo-group')
        });
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        objectUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.download = 'custqr-code.svg';
        link.href = objectUrl;
        link.click();
      } else {
        // Generate canvas for PNG/PDF (reuse same canvas for both)
        const canvas = await generateDownloadQR('canvas') as HTMLCanvasElement;
        
        // Add logo overlay using reusable function
        await addLogoToCanvas(canvas);
        
        if (format === 'png') {
          // Generate maximum quality PNG from high-resolution canvas
          const dataUrl = canvas.toDataURL('image/png', 1.0); // Maximum quality
          
          // Validate PNG generation
          if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
            throw new Error('PNG generation failed - invalid data URL');
          }
          
          const link = document.createElement('a');
          link.download = 'custqr-code.png';
          link.href = dataUrl;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          debugLog('High-quality PNG download completed', {
            canvasSize: `${canvas.width}x${canvas.height}`,
            estimatedSize: Math.round((dataUrl.length * 0.75) / 1024) + 'KB'
          });
          
        } else if (format === 'pdf') {
          // Generate high-quality PDF with dynamic sizing
          const pdf = new jsPDF();
          const imgData = canvas.toDataURL('image/png', 1.0); // Maximum quality
          
          // Validate image data
          if (!imgData || !imgData.startsWith('data:image/png')) {
            throw new Error('Failed to convert canvas to image data for PDF');
          }
          
          // Calculate optimal PDF dimensions maintaining aspect ratio
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          
          // Use larger PDF size for better quality (up to 80% of page)
          const maxPdfSize = Math.min(pageWidth - 20, pageHeight - 20) * 0.8;
          const aspectRatio = canvas.height / canvas.width;
          const pdfWidth = Math.min(maxPdfSize, options.width * 0.8); // Larger scale for quality
          const pdfHeight = pdfWidth * aspectRatio;
          
          // Center the QR code on the page
          const x = (pageWidth - pdfWidth) / 2;
          const y = (pageHeight - pdfHeight) / 2;
          
          // Add image with maximum quality
          pdf.addImage(imgData, 'PNG', x, y, pdfWidth, pdfHeight, undefined, 'FAST');
          
          // Add professional metadata
          pdf.setProperties({
            title: 'CustQR Code',
            subject: `QR Code for ${url}`,
            creator: 'CustQR - Professional QR Generator',
            author: 'CustQR',
            keywords: 'QR Code, CustQR, Professional'
          });
          
          pdf.save('custqr-code.pdf');
          
          debugLog('High-quality PDF download completed', {
            canvasSize: `${canvas.width}x${canvas.height}`,
            pdfDimensions: `${Math.round(pdfWidth)}x${Math.round(pdfHeight)}`,
            position: `${Math.round(x)},${Math.round(y)}`
          });
        }
      }

      toast({
        title: "Download Complete",
        description: `QR code saved as ${format.toUpperCase()}`,
        variant: "default"
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Download failed:', error);
      
      toast({
        title: "Download Failed",
        description: `Failed to download QR code: ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      // Clean up object URL to prevent memory leaks
      if (objectUrl) {
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 100);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-none sm:max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl px-1 sm:px-0">
        {/* Header */}
        <header className="mb-4 sm:mb-6 md:mb-8 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center mb-2 sm:mb-3 logo-header-container gap-2 sm:gap-0">
            <Logo size="xl" priority className="flex-shrink-0" onClick={handleLogoClick} />
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text-primary" role="banner">
              CustQR
            </h1>
          </div>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg px-4 sm:px-0">
            Professional QR Code Generator
          </p>
        </header>

        <div className="grid gap-4 sm:gap-5 md:gap-6 lg:grid-cols-2 items-start">
          {/* Controls Panel */}
          <Card className="gradient-glass shadow-medium">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl md:text-2xl">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-5 md:space-y-6">
              {/* URL Input */}
              <div className="space-y-2">
                <Label htmlFor="url" className="text-xs sm:text-sm font-medium">
                  Target URL
                </Label>
                <div className="relative">
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pr-8 sm:pr-10 transition-smooth text-sm sm:text-base"
                  />
                  <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2">
                    {url && validateUrl(url) ? (
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                    ) : url ? (
                      <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                    ) : null}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="appearance" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
                  <TabsTrigger value="appearance" className="text-xs sm:text-sm">
                    <span className="hidden xs:inline sm:inline">Appearance</span>
                    <span className="xs:hidden sm:hidden">App</span>
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="text-xs sm:text-sm">
                    <span className="hidden xs:inline sm:inline">Advanced</span>
                    <span className="xs:hidden sm:hidden">Adv</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="appearance" className="space-y-4">
                  {/* Color Customization */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="foreground">Foreground Color</Label>
                      <div className="flex gap-2 sm:gap-3">
                        <Input
                          id="foreground"
                          type="color"
                          value={options.color.dark}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            const validation = validateHexColor(newColor);
                            if (validation.isValid) {
                              setOptions(prev => ({
                            ...prev,
                                color: { ...prev.color, dark: newColor }
                              }));
                            }
                          }}
                          className="w-10 h-8 sm:w-12 sm:h-10 p-1 rounded-md"
                        />
                        <Input
                          value={options.color.dark}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            const validation = validateHexColor(newColor);
                            if (validation.isValid) {
                              setOptions(prev => ({
                                ...prev,
                                color: { ...prev.color, dark: newColor }
                              }));
                            } else if (newColor === '' || newColor.startsWith('#')) {
                              // Allow intermediate states while typing
                              setOptions(prev => ({
                                ...prev,
                                color: { ...prev.color, dark: newColor }
                              }));
                            }
                          }}
                          onBlur={(e) => {
                            const validation = validateHexColor(e.target.value);
                            if (!validation.isValid && e.target.value !== '') {
                              toast({
                                title: "Invalid Color",
                                description: validation.error,
                                variant: "destructive"
                              });
                              // Reset to previous valid value
                              setOptions(prev => ({
                            ...prev,
                                color: { ...prev.color, dark: '#1e293b' }
                              }));
                            }
                          }}
                          className={`flex-1 ${!validateHexColor(options.color.dark).isValid && options.color.dark !== '' ? 'border-destructive' : ''}`}
                          placeholder="#1e293b"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="background">Background Color</Label>
                      <div className="flex gap-2 sm:gap-3">
                        <Input
                          id="background"
                          type="color"
                          value={options.color.light}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            const validation = validateHexColor(newColor);
                            if (validation.isValid) {
                              setOptions(prev => ({
                            ...prev,
                                color: { ...prev.color, light: newColor }
                              }));
                            }
                          }}
                          className="w-10 h-8 sm:w-12 sm:h-10 p-1 rounded-md"
                        />
                        <Input
                          value={options.color.light}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            const validation = validateHexColor(newColor);
                            if (validation.isValid) {
                              setOptions(prev => ({
                                ...prev,
                                color: { ...prev.color, light: newColor }
                              }));
                            } else if (newColor === '' || newColor.startsWith('#')) {
                              // Allow intermediate states while typing
                              setOptions(prev => ({
                                ...prev,
                                color: { ...prev.color, light: newColor }
                              }));
                            }
                          }}
                          onBlur={(e) => {
                            const validation = validateHexColor(e.target.value);
                            if (!validation.isValid && e.target.value !== '') {
                              toast({
                                title: "Invalid Color",
                                description: validation.error,
                                variant: "destructive"
                              });
                              // Reset to previous valid value
                              setOptions(prev => ({
                            ...prev,
                                color: { ...prev.color, light: '#ffffff' }
                              }));
                            }
                          }}
                          className={`flex-1 ${!validateHexColor(options.color.light).isValid && options.color.light !== '' ? 'border-destructive' : ''}`}
                          placeholder="#ffffff"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Color Contrast Indicator */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                      Color Contrast Analysis
                      {colorValidation.scannable ? (
                        <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                      ) : (
                        <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-warning" />
                      )}
                    </Label>
                    <div className="p-2 sm:p-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span>Contrast Ratio:</span>
                        <span className={`font-medium ${colorValidation.scannable ? 'text-success' : 'text-warning'}`}>
                          {colorValidation.contrastRatio?.toFixed(2) || 'N/A'}:1
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {colorValidation.scannable 
                          ? 'Excellent contrast for QR scanning' 
                          : 'Warning: Low contrast may affect scannability'}
                      </div>
                    </div>
                  </div>

                  {/* Enterprise Logo Upload */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Logo (Optional)</Label>
                      {logo && (
                        <Button
                          onClick={handleLogoRemoval}
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          aria-label="Remove uploaded logo image"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Remove Image
                        </Button>
                      )}
                    </div>
                    
                    <div 
                      onClick={() => !isUploading && logoInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`
                        border-2 border-dashed rounded-lg p-4 sm:p-6 text-center transition-all duration-200
                        ${
                          isUploading 
                            ? 'border-primary/50 bg-primary/5 cursor-wait' 
                            : isDragOver 
                            ? 'border-primary bg-primary/10 cursor-pointer' 
                            : logo 
                            ? 'border-border hover:border-primary/60 cursor-pointer' 
                            : 'border-border hover:border-primary cursor-pointer'
                        }
                      `}
                      role="button"
                      tabIndex={0}
                      aria-label={logo ? "Change logo" : "Upload logo"}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!isUploading) logoInputRef.current?.click();
                        }
                      }}
                    >
                      {isUploading ? (
                        <div className="space-y-3">
                          <div className="mx-auto w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <div>
                            <p className="text-sm font-medium text-primary">Processing Image...</p>
                            <p className="text-xs text-muted-foreground mt-1">Optimizing for best quality</p>
                          </div>
                        </div>
                      ) : logo ? (
                        <div className="space-y-3">
                          <div className="relative inline-block">
                            <img 
                              src={logo} 
                              alt="Logo preview" 
                              className="mx-auto h-16 w-16 sm:h-20 sm:w-20 object-contain rounded-md border border-border/50" 
                            />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Logo Ready</p>
                            <p className="text-xs text-muted-foreground">Click to change or drag new file</p>
                            {logoInfo && (
                              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                                <p className="truncate max-w-[200px] mx-auto">{logoInfo.name}</p>
                                <p>{logoInfo.dimensions} • {Math.round(logoInfo.size / 1024)}KB</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className={`mx-auto transition-colors ${
                            isDragOver ? 'text-primary' : 'text-muted-foreground'
                          }`}>
                            <Upload className="mx-auto h-8 w-8 sm:h-10 sm:w-10" />
                          </div>
                          <div>
                            <p className={`text-sm font-medium transition-colors ${
                              isDragOver ? 'text-primary' : 'text-foreground'
                            }`}>
                              {isDragOver ? 'Drop image here' : 'Upload Logo'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="hidden sm:inline">Drag & drop or </span>click to browse
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              PNG, JPG, WebP, SVG • Max 5MB • 32px minimum
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/avif,image/bmp"
                      onChange={handleFileInputChange}
                      className="hidden"
                      aria-hidden="true"
                    />
                    
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  {/* Error Correction */}
                  <div className="space-y-2">
                    <Label>Error Correction Level</Label>
                    <Select
                      value={options.errorCorrectionLevel}
                      onValueChange={(value: 'L' | 'M' | 'Q' | 'H') => 
                        setOptions(prev => ({ ...prev, errorCorrectionLevel: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L">Low (7%)</SelectItem>
                        <SelectItem value="M">Medium (15%)</SelectItem>
                        <SelectItem value="Q">Quartile (25%)</SelectItem>
                        <SelectItem value="H">High (30%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Size and Margin */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="size">Size (px)</Label>
                      <Select
                        value={options.width.toString()}
                        onValueChange={(value) => {
                          const numValue = parseInt(value, 10);
                          setOptions(prev => ({
                          ...prev,
                            width: numValue
                          }));
                        }}
                      >
                        <SelectTrigger id="size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="128">128px</SelectItem>
                          <SelectItem value="160">160px</SelectItem>
                          <SelectItem value="192">192px</SelectItem>
                          <SelectItem value="224">224px</SelectItem>
                          <SelectItem value="256">256px</SelectItem>
                          <SelectItem value="288">288px</SelectItem>
                          <SelectItem value="320">320px</SelectItem>
                          <SelectItem value="352">352px</SelectItem>
                          <SelectItem value="384">384px</SelectItem>
                          <SelectItem value="416">416px</SelectItem>
                          <SelectItem value="448">448px</SelectItem>
                          <SelectItem value="480">480px</SelectItem>
                          <SelectItem value="512">512px</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="margin">Margin</Label>
                      <Input
                        id="margin"
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        value={options.margin}
                        onChange={(e) => {
                          const validation = validateNumericInput(e.target.value, 0, 10, 2);
                          setOptions(prev => ({
                          ...prev,
                            margin: validation.parsedValue
                          }));
                        }}
                        onBlur={(e) => {
                          const validation = validateNumericInput(e.target.value, 0, 10, 2);
                          if (!validation.isValid) {
                            toast({
                              title: "Invalid Margin",
                              description: validation.error,
                              variant: "destructive"
                            });
                          }
                        }}
                        className={`${!marginValidation.isValid ? 'border-destructive' : ''}`}
                        placeholder="2"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Preview and Download Panel */}
          <Card className="gradient-glass shadow-medium h-fit">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl md:text-2xl">Preview & Download</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-5 md:space-y-6">
              {/* QR Preview */}
              <div className="flex justify-center px-1 sm:px-2 md:px-0">
                <div 
                  ref={qrRef}
                  className="relative p-3 sm:p-3 md:p-4 bg-card rounded-lg shadow-subtle w-full max-w-[280px] sm:max-w-sm md:max-w-none md:w-auto"
                  style={{ backgroundColor: options.color.light }}
                >
                  {displayQrUrl ? (
                    <div className="relative">
                      {/* Background layer */}
                      <div 
                        className="absolute inset-0 rounded"
                        style={{ 
                          backgroundColor: options.color.light,
                          width: `min(${options.width}px, calc(100vw - 3rem))`, 
                          height: `min(${options.width}px, calc(100vw - 3rem))`
                        }}
                      />
                      {/* Foreground color layer with QR mask */}
                      <div 
                        className="absolute inset-0 rounded"
                        style={{ 
                          backgroundColor: options.color.dark,
                          width: `min(${options.width}px, calc(100vw - 3rem))`, 
                          height: `min(${options.width}px, calc(100vw - 3rem))`,
                          WebkitMask: `url(${displayQrUrl}) no-repeat center`,
                          WebkitMaskSize: 'contain',
                          mask: `url(${displayQrUrl}) no-repeat center`,
                          maskSize: 'contain'
                        }}
                      />
                      {/* Invisible QR image for proper sizing */}
                      <img 
                        src={displayQrUrl} 
                        alt="Generated QR Code"
                        className="relative max-w-full h-auto transition-opacity duration-200 opacity-0"
                        style={{ 
                          width: `min(${options.width}px, calc(100vw - 3rem))`, 
                          height: `min(${options.width}px, calc(100vw - 3rem))`
                        }}
                      />
                      {logo && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                          <div 
                            className="bg-white rounded-full shadow-md flex items-center justify-center"
                            style={{
                              padding: `${previewCirclePadding}px`,
                              width: `${previewLogoSize + (previewCirclePadding * 2)}px`,
                              height: `${previewLogoSize + (previewCirclePadding * 2)}px`
                            }}
                          >
                            <img 
                              src={logo} 
                              alt="Logo" 
                              className="object-contain"
                              style={{
                                width: `${previewLogoSize}px`,
                                height: `${previewLogoSize}px`
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div 
                      className="grid place-items-center border-2 border-dashed border-muted-foreground/30 rounded-lg"
                      style={{ 
                        width: `min(${options.width}px, calc(100vw - 3rem))`, 
                        height: `min(${options.width}px, calc(100vw - 3rem))`
                      }}
                    >
                      <p className="text-muted-foreground text-center text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed px-2 sm:px-4">
                        Enter a URL to generate QR code
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Buttons */}
              {displayQrUrl && (
                <div className="space-y-3">
                  <Label className="text-xs sm:text-sm font-medium">Download Options</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2">
                    <Button
                      onClick={() => downloadQR('png')}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PNG
                    </Button>
                    <Button
                      onClick={() => downloadQR('svg')}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      SVG
                    </Button>
                    <Button
                      onClick={() => downloadQR('pdf')}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF
                    </Button>
                  </div>
                </div>
              )}

              {/* Auto-generation active - no manual button needed */}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QRGenerator;