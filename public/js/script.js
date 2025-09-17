/**
 * CustQR - Professional QR Code Generator
 * Pure JavaScript implementation with enterprise-grade features
 */

class CustQRGenerator {
    constructor() {
        this.currentQRData = null;
        this.currentLogo = null;
        this.isGenerating = false;
        this.debounceTimer = null;
        
        // Default options
        this.options = {
            errorCorrectionLevel: 'M',
            width: 256,
            margin: 2,
            color: {
                dark: '#1e293b',
                light: '#ffffff'
            }
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.initializeLucideIcons();
        this.updateUI();
    }
    
    initializeLucideIcons() {
        // Initialize Lucide icons if available
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    bindEvents() {
        // URL input
        const urlInput = document.getElementById('url-input');
        urlInput.addEventListener('input', (e) => this.handleURLChange(e.target.value));
        
        // Color inputs
        this.bindColorInputs();
        
        // Logo upload
        const logoUpload = document.getElementById('logo-upload');
        const logoInput = document.getElementById('logo-input');
        logoUpload.addEventListener('click', () => logoInput.click());
        logoUpload.addEventListener('dragover', (e) => this.handleDragOver(e));
        logoUpload.addEventListener('drop', (e) => this.handleDrop(e));
        logoInput.addEventListener('change', (e) => this.handleLogoUpload(e));
        
        // Advanced options
        const errorCorrection = document.getElementById('error-correction');
        const qrSize = document.getElementById('qr-size');
        const qrMargin = document.getElementById('qr-margin');
        
        errorCorrection.addEventListener('change', (e) => {
            this.options.errorCorrectionLevel = e.target.value;
            this.generateQRDebounced();
        });
        
        qrSize.addEventListener('input', (e) => {
            this.options.width = parseInt(e.target.value) || 256;
            this.generateQRDebounced();
        });
        
        qrMargin.addEventListener('input', (e) => {
            this.options.margin = parseInt(e.target.value) || 2;
            this.generateQRDebounced();
        });
        
        // Tabs
        this.bindTabEvents();
        
        // Download buttons
        this.bindDownloadEvents();
        
        // Generate button
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.addEventListener('click', () => this.generateQR());
    }
    
    bindColorInputs() {
        const foregroundColor = document.getElementById('foreground-color');
        const foregroundText = document.getElementById('foreground-text');
        const backgroundColor = document.getElementById('background-color');
        const backgroundText = document.getElementById('background-text');
        
        // Sync color picker with text input
        foregroundColor.addEventListener('input', (e) => {
            foregroundText.value = e.target.value;
            this.options.color.dark = e.target.value;
            this.generateQRDebounced();
        });
        
        foregroundText.addEventListener('input', (e) => {
            if (this.isValidColor(e.target.value)) {
                foregroundColor.value = e.target.value;
                this.options.color.dark = e.target.value;
                this.generateQRDebounced();
            }
        });
        
        backgroundColor.addEventListener('input', (e) => {
            backgroundText.value = e.target.value;
            this.options.color.light = e.target.value;
            this.generateQRDebounced();
        });
        
        backgroundText.addEventListener('input', (e) => {
            if (this.isValidColor(e.target.value)) {
                backgroundColor.value = e.target.value;
                this.options.color.light = e.target.value;
                this.generateQRDebounced();
            }
        });
    }
    
    bindTabEvents() {
        const tabTriggers = document.querySelectorAll('.tab-trigger');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabTriggers.forEach(trigger => {
            trigger.addEventListener('click', () => {
                const tabName = trigger.dataset.tab;
                
                // Update triggers
                tabTriggers.forEach(t => t.classList.remove('active'));
                trigger.classList.add('active');
                
                // Update content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabName}-tab`) {
                        content.classList.add('active');
                    }
                });
            });
        });
    }
    
    bindDownloadEvents() {
        const downloadPNG = document.getElementById('download-png');
        const downloadSVG = document.getElementById('download-svg');
        const downloadPDF = document.getElementById('download-pdf');
        
        downloadPNG.addEventListener('click', () => this.downloadQR('png'));
        downloadSVG.addEventListener('click', () => this.downloadQR('svg'));
        downloadPDF.addEventListener('click', () => this.downloadQR('pdf'));
    }
    
    handleURLChange(url) {
        const urlStatus = document.getElementById('url-status');
        const generateBtn = document.getElementById('generate-btn');
        
        if (!url) {
            urlStatus.innerHTML = '';
            generateBtn.disabled = true;
            this.hideQR();
            return;
        }
        
        if (this.validateURL(url)) {
            urlStatus.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4" style="color: hsl(var(--color-success));"></i>';
            generateBtn.disabled = false;
            this.generateQRDebounced(url);
        } else {
            urlStatus.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4" style="color: hsl(var(--color-destructive));"></i>';
            generateBtn.disabled = true;
            this.hideQR();
        }
        
        // Re-initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    validateURL(url) {
        if (!url) return false;
        try {
            const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
            return urlPattern.test(url) || new URL(url).protocol.startsWith('http');
        } catch {
            try {
                new URL(`https://${url}`);
                return true;
            } catch {
                return false;
            }
        }
    }
    
    sanitizeURL(url) {
        const trimmed = url.trim();
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            return `https://${trimmed}`;
        }
        return trimmed;
    }
    
    isValidColor(color) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }
    
    generateQRDebounced(url = null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const urlInput = document.getElementById('url-input');
            const targetURL = url || urlInput.value;
            if (targetURL && this.validateURL(targetURL)) {
                this.generateQR(targetURL);
            }
        }, 500);
    }
    
    async generateQR(url = null) {
        if (this.isGenerating) return;
        
        const urlInput = document.getElementById('url-input');
        const targetURL = url || urlInput.value;
        
        if (!targetURL || !this.validateURL(targetURL)) {
            this.showToast('Invalid URL', 'Please enter a valid URL to generate QR code', 'error');
            return;
        }
        
        this.isGenerating = true;
        this.updateGenerateButton(true);
        
        try {
            const sanitizedURL = this.sanitizeURL(targetURL);
            const canvas = document.getElementById('qr-canvas');
            
            await QRCode.toCanvas(canvas, sanitizedURL, {
                ...this.options,
                width: this.options.width,
                margin: this.options.margin,
                color: {
                    dark: this.options.color.dark,
                    light: this.options.color.light
                },
                errorCorrectionLevel: this.options.errorCorrectionLevel
            });
            
            this.currentQRData = sanitizedURL;
            this.showQR();
            this.showToast('QR Code Generated', 'Your QR code is ready for download', 'success');
            
        } catch (error) {
            console.error('QR Generation Error:', error);
            this.showToast('Generation Failed', 'Failed to generate QR code. Please try again.', 'error');
        }
        
        this.isGenerating = false;
        this.updateGenerateButton(false);
    }
    
    showQR() {
        const placeholder = document.getElementById('qr-placeholder');
        const canvas = document.getElementById('qr-canvas');
        const downloadSection = document.getElementById('download-section');
        const logoOverlay = document.getElementById('logo-overlay');
        
        placeholder.classList.add('hidden');
        canvas.classList.remove('hidden');
        downloadSection.classList.remove('hidden');
        
        // Update QR preview background
        const qrPreview = document.getElementById('qr-preview');
        qrPreview.style.backgroundColor = this.options.color.light;
        
        // Show logo overlay if logo exists
        if (this.currentLogo) {
            const overlayLogo = document.getElementById('overlay-logo');
            overlayLogo.src = this.currentLogo;
            logoOverlay.classList.remove('hidden');
        } else {
            logoOverlay.classList.add('hidden');
        }
    }
    
    hideQR() {
        const placeholder = document.getElementById('qr-placeholder');
        const canvas = document.getElementById('qr-canvas');
        const downloadSection = document.getElementById('download-section');
        
        placeholder.classList.remove('hidden');
        canvas.classList.add('hidden');
        downloadSection.classList.add('hidden');
        
        this.currentQRData = null;
    }
    
    updateGenerateButton(isGenerating) {
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.textContent = isGenerating ? 'Generating...' : 'Generate QR Code';
        generateBtn.disabled = isGenerating;
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.borderColor = 'hsl(var(--color-primary))';
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.borderColor = 'hsl(var(--color-border))';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processLogoFile(files[0]);
        }
    }
    
    handleLogoUpload(e) {
        const file = e.target.files[0];
        if (file) {
            this.processLogoFile(file);
        }
    }
    
    processLogoFile(file) {
        if (file.size > 2 * 1024 * 1024) {
            this.showToast('File too large', 'Logo must be under 2MB', 'error');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            this.showToast('Invalid file type', 'Please select an image file', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentLogo = e.target.result;
            this.updateLogoPreview();
            if (this.currentQRData) {
                this.showQR(); // Update overlay
            }
        };
        reader.readAsDataURL(file);
    }
    
    updateLogoPreview() {
        const uploadContent = document.getElementById('upload-content');
        const logoPreview = document.getElementById('logo-preview');
        const logoImage = document.getElementById('logo-image');
        
        if (this.currentLogo) {
            logoImage.src = this.currentLogo;
            uploadContent.classList.add('hidden');
            logoPreview.classList.remove('hidden');
        } else {
            uploadContent.classList.remove('hidden');
            logoPreview.classList.add('hidden');
        }
    }
    
    async downloadQR(format) {
        if (!this.currentQRData) return;
        
        try {
            if (format === 'png') {
                await this.downloadPNG();
            } else if (format === 'svg') {
                await this.downloadSVG();
            } else if (format === 'pdf') {
                await this.downloadPDF();
            }
            
            this.showToast('Download Complete', `QR code saved as ${format.toUpperCase()}`, 'success');
        } catch (error) {
            console.error('Download Error:', error);
            this.showToast('Download Failed', 'Failed to download QR code', 'error');
        }
    }
    
    async downloadPNG() {
        const qrPreview = document.getElementById('qr-preview');
        const canvas = await html2canvas(qrPreview, {
            backgroundColor: this.options.color.light,
            scale: 2,
            logging: false
        });
        
        const link = document.createElement('a');
        link.download = 'custqr-code.png';
        link.href = canvas.toDataURL();
        link.click();
    }
    
    async downloadSVG() {
        const svgString = await QRCode.toString(this.currentQRData, {
            ...this.options,
            type: 'svg',
            width: this.options.width,
            margin: this.options.margin,
            color: {
                dark: this.options.color.dark,
                light: this.options.color.light
            }
        });
        
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = 'custqr-code.svg';
        link.href = URL.createObjectURL(blob);
        link.click();
    }
    
    async downloadPDF() {
        const qrPreview = document.getElementById('qr-preview');
        const canvas = await html2canvas(qrPreview, {
            backgroundColor: this.options.color.light,
            scale: 2,
            logging: false
        });
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 100;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 55, 50, imgWidth, imgHeight);
        pdf.save('custqr-code.pdf');
    }
    
    showToast(title, description, type = 'default') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-title">${title}</div>
            <div class="toast-description">${description}</div>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }
    
    updateUI() {
        // Set initial values
        document.getElementById('foreground-color').value = this.options.color.dark;
        document.getElementById('foreground-text').value = this.options.color.dark;
        document.getElementById('background-color').value = this.options.color.light;
        document.getElementById('background-text').value = this.options.color.light;
        document.getElementById('error-correction').value = this.options.errorCorrectionLevel;
        document.getElementById('qr-size').value = this.options.width;
        document.getElementById('qr-margin').value = this.options.margin;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CustQRGenerator();
});

// Service Worker Registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}