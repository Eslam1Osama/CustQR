import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import { Download, Upload, Settings, Palette, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
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

  const validateFileUpload = useCallback((file: File): ValidationResult => {
    // File size validation (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      return { isValid: false, error: 'File size must be under 2MB' };
    }

    // File type validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'File must be an image (JPEG, PNG, GIF, or WebP)' };
    }

    return { isValid: true };
  }, []);

  const validateUrl = (input: string): boolean => {
    if (!input) return false;
    try {
      const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
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
  };

  const sanitizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  // Memoized validation states for performance
  const colorValidation = useMemo(() => 
    validateColorContrast(options.color.dark, options.color.light),
    [options.color.dark, options.color.light, validateColorContrast]
  );

  const sizeValidation = useMemo(() => 
    validateNumericInput(options.width.toString(), 128, 1024, 256),
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

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFileUpload(file);
    if (!validation.isValid) {
      toast({
        title: "Invalid File",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    // Additional dimension validation
    const img = new Image();
    img.onload = () => {
      // Check if image dimensions are reasonable (not too small or too large)
      if (img.width < 16 || img.height < 16) {
        toast({
          title: "Image Too Small",
          description: "Logo must be at least 16x16 pixels",
          variant: "destructive"
        });
        return;
      }
      
      if (img.width > 2048 || img.height > 2048) {
        toast({
          title: "Image Too Large",
          description: "Logo dimensions must be under 2048x2048 pixels",
          variant: "destructive"
        });
        return;
      }

      // If all validations pass, set the logo
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogo(event.target?.result as string);
        toast({
          title: "Logo Uploaded",
          description: "Logo successfully added to QR code",
          variant: "default"
        });
      };
      reader.onerror = () => {
        toast({
          title: "Upload Failed",
          description: "Failed to read image file",
          variant: "destructive"
        });
      };
      reader.readAsDataURL(file);
    };
    
    img.onerror = () => {
      toast({
        title: "Invalid Image",
        description: "File is not a valid image",
        variant: "destructive"
      });
    };
    
    // Create object URL for dimension checking
    img.src = URL.createObjectURL(file);
  }, [validateFileUpload, toast]);

  const downloadQR = async (format: 'png' | 'svg' | 'pdf') => {
    if (!qrDataUrl) return;

    try {
      if (format === 'png') {
        if (qrRef.current) {
          const canvas = await html2canvas(qrRef.current, {
            backgroundColor: options.color.light,
            scale: 2
          });
          const link = document.createElement('a');
          link.download = 'custqr-code.png';
          link.href = canvas.toDataURL();
          link.click();
        }
      } else if (format === 'svg') {
        const svgString = await QRCode.toString(sanitizeUrl(url), { 
          ...options, 
          type: 'svg' 
        });
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = 'custqr-code.svg';
        link.href = URL.createObjectURL(blob);
        link.click();
      } else if (format === 'pdf') {
        if (qrRef.current) {
          const canvas = await html2canvas(qrRef.current, {
            backgroundColor: options.color.light,
            scale: 2
          });
          const pdf = new jsPDF();
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = 100;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 55, 50, imgWidth, imgHeight);
          pdf.save('custqr-code.pdf');
        }
      }

      toast({
        title: "Download Complete",
        description: `QR code saved as ${format.toUpperCase()}`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download QR code",
        variant: "destructive"
      });
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
            Professional QR Code Generator for Enterprise Use
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
              <CardDescription className="text-xs sm:text-sm">
                Customize your QR code settings and branding
              </CardDescription>
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
                    <Palette className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
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

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label>Logo (Optional)</Label>
                    <div 
                      onClick={() => logoInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-4 sm:p-6 text-center cursor-pointer hover:border-primary transition-colors"
                    >
                      {logo ? (
                        <div className="space-y-2">
                          <img src={logo} alt="Logo" className="mx-auto h-10 w-10 sm:h-12 sm:w-12 object-contain" />
                          <p className="text-xs sm:text-sm text-muted-foreground">Click to change logo</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="mx-auto h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            <span className="hidden sm:inline">Drag & drop or </span>Click to upload logo
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPG up to 2MB
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
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
                      <Input
                        id="size"
                        type="number"
                        min="128"
                        max="1024"
                        step="8"
                        value={options.width}
                        onChange={(e) => {
                          const validation = validateNumericInput(e.target.value, 128, 1024, 256);
                          setOptions(prev => ({
                            ...prev,
                            width: validation.parsedValue
                          }));
                        }}
                        onBlur={(e) => {
                          const validation = validateNumericInput(e.target.value, 128, 1024, 256);
                          if (!validation.isValid) {
                            toast({
                              title: "Invalid Size",
                              description: validation.error,
                              variant: "destructive"
                            });
                          }
                        }}
                        className={`${!sizeValidation.isValid ? 'border-destructive' : ''}`}
                        placeholder="256"
                      />
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
              <CardDescription className="text-xs sm:text-sm">
                Real-time preview of your QR code
              </CardDescription>
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
                          <div className="bg-white p-1 rounded-full shadow-md">
                            <img 
                              src={logo} 
                              alt="Logo" 
                              className="w-8 h-8 object-contain"
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