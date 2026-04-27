class FileUploadManager {
    constructor() {
        this.files = new Map();
        this.uploadQueue = [];
        this.activeUploads = new Set();
        this.completedUploads = new Set();
        this.failedUploads = new Set();
        this.isPaused = false;
        this.settings = {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            concurrentUploads: 3,
            autoRetry: true,
            generatePreviews: true,
            retryAttempts: 3,
            retryDelay: 2000
        };
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.loadSettings();
        this.updateStats();
    }
    
    setupElements() {
        this.elements = {
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            mobileFileInput: document.getElementById('mobileFileInput'),
            browseBtn: document.getElementById('browseBtn'),
            uploadAllBtn: document.getElementById('uploadAllBtn'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            retryAllBtn: document.getElementById('retryAllBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            fileQueue: document.getElementById('fileQueue'),
            filterSelect: document.getElementById('filterSelect'),
            totalFiles: document.getElementById('totalFiles'),
            uploadedFiles: document.getElementById('uploadedFiles'),
            failedFiles: document.getElementById('failedFiles'),
            totalSize: document.getElementById('totalSize'),
            maxFileSize: document.getElementById('maxFileSize'),
            concurrentUploads: document.getElementById('concurrentUploads'),
            autoRetry: document.getElementById('autoRetry'),
            generatePreviews: document.getElementById('generatePreviews'),
            toastContainer: document.getElementById('toastContainer')
        };
    }
    
    setupEventListeners() {
        // Upload zone events
        this.elements.uploadZone.addEventListener('click', () => this.browseFiles());
        this.elements.uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
        this.elements.uploadZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.elements.uploadZone.addEventListener('drop', this.handleDrop.bind(this));
        
        // File input events
        this.elements.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.elements.mobileFileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.elements.browseBtn.addEventListener('click', () => this.browseFiles());
        
        // Control buttons
        this.elements.uploadAllBtn.addEventListener('click', () => this.uploadAll());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAll());
        this.elements.retryAllBtn.addEventListener('click', () => this.retryFailed());
        this.elements.pauseBtn.addEventListener('click', () => this.togglePause());
        
        // Filter and settings
        this.elements.filterSelect.addEventListener('change', () => this.filterFiles());
        this.elements.maxFileSize.addEventListener('change', () => this.updateSetting('maxFileSize'));
        this.elements.concurrentUploads.addEventListener('change', () => this.updateSetting('concurrentUploads'));
        this.elements.autoRetry.addEventListener('change', () => this.updateSetting('autoRetry'));
        this.elements.generatePreviews.addEventListener('change', () => this.updateSetting('generatePreviews'));
        
        // Global events
        document.addEventListener('paste', this.handlePaste.bind(this));
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, this.preventDefaults, false);
        });
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    handleDragOver(e) {
        this.preventDefaults(e);
        this.elements.uploadZone.classList.add('dragover');
    }
    
    handleDragLeave(e) {
        this.preventDefaults(e);
        this.elements.uploadZone.classList.remove('dragover');
    }
    
    handleDrop(e) {
        this.preventDefaults(e);
        this.elements.uploadZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        this.addFiles(files);
    }
    
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
    }
    
    handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        const files = [];
        for (let item of items) {
            if (item.kind === 'file') {
                files.push(item.getAsFile());
            }
        }
        
        if (files.length > 0) {
            this.addFiles(files);
        }
    }
    
    browseFiles() {
        // Use mobile input on touch devices
        const input = 'ontouchstart' in window ? 
            this.elements.mobileFileInput : 
            this.elements.fileInput;
        input.click();
    }
    
    addFiles(files) {
        files.forEach(file => {
            const fileId = this.generateFileId();
            const fileData = {
                id: fileId,
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                status: 'pending',
                progress: 0,
                error: null,
                retryCount: 0,
                preview: null,
                uploadUrl: null,
                addedAt: Date.now()
            };
            
            // Validate file
            if (!this.validateFile(fileData)) {
                return;
            }
            
            // Generate preview if enabled and it's an image
            if (this.settings.generatePreviews && file.type.startsWith('image/')) {
                this.generatePreview(fileData);
            }
            
            this.files.set(fileId, fileData);
            this.uploadQueue.push(fileId);
        });
        
        this.renderQueue();
        this.updateStats();
        this.showToast(`${files.length} file(s) added to queue`, 'success');
    }
    
    validateFile(fileData) {
        // Check file size
        if (fileData.size > this.settings.maxFileSize) {
            this.showToast(
                `File "${fileData.name}" exceeds maximum size of ${this.formatFileSize(this.settings.maxFileSize)}`,
                'error'
            );
            return false;
        }
        
        // Check file type (basic validation)
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'text/plain',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip', 'application/x-rar-compressed'
        ];
        
        if (!allowedTypes.includes(fileData.type) && !fileData.type.startsWith('image/')) {
            this.showToast(
                `File type "${fileData.type}" is not supported`,
                'error'
            );
            return false;
        }
        
        return true;
    }
    
    generatePreview(fileData) {
        const reader = new FileReader();
        reader.onload = (e) => {
            fileData.preview = e.target.result;
            this.updateFileItem(fileData.id);
        };
        reader.readAsDataURL(fileData.file);
    }
    
    generateFileId() {
        return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    renderQueue() {
        const filter = this.elements.filterSelect.value;
        const filteredFiles = Array.from(this.files.values()).filter(file => {
            if (filter === 'all') return true;
            return file.status === filter;
        });
        
        if (filteredFiles.length === 0) {
            this.elements.fileQueue.innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-3"></i>
                    <p>No files in queue. Drop files above to get started.</p>
                </div>
            `;
            return;
        }
        
        this.elements.fileQueue.innerHTML = filteredFiles.map(file => this.renderFileItem(file)).join('');
    }
    
    renderFileItem(file) {
        const statusIcon = this.getStatusIcon(file.status);
        const statusColor = this.getStatusColor(file.status);
        const preview = this.renderPreview(file);
        const progressBar = this.renderProgressBar(file);
        const actions = this.renderActions(file);
        
        return `
            <div class="file-item p-4 hover:bg-gray-50 transition" data-file-id="${file.id}">
                <div class="flex items-center space-x-4">
                    ${preview}
                    
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="font-medium text-gray-900 truncate">${file.name}</h4>
                            <span class="text-sm text-gray-500">${this.formatFileSize(file.size)}</span>
                        </div>
                        
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center text-sm ${statusColor}">
                                ${statusIcon}
                                ${file.status}
                            </span>
                            ${file.error ? `<span class="text-sm text-red-600">${file.error}</span>` : ''}
                        </div>
                        
                        ${progressBar}
                    </div>
                    
                    <div class="flex space-x-2">
                        ${actions}
                    </div>
                </div>
            </div>
        `;
    }
    
    renderPreview(file) {
        if (file.preview) {
            return `
                <img src="${file.preview}" alt="${file.name}" 
                     class="preview-image w-16 h-16 rounded-lg object-cover cursor-pointer"
                     onclick="fileUploadManager.viewPreview('${file.id}')">
            `;
        }
        
        const iconClass = this.getFileIcon(file.type);
        return `
            <div class="file-icon w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                <i class="${iconClass}"></i>
            </div>
        `;
    }
    
    renderProgressBar(file) {
        if (file.status !== 'uploading') return '';
        
        return `
            <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div class="progress-bar bg-blue-600 h-2 rounded-full" 
                     style="width: ${file.progress}%"></div>
            </div>
        `;
    }
    
    renderActions(file) {
        let actions = '';
        
        if (file.status === 'pending') {
            actions += `
                <button onclick="fileUploadManager.uploadFile('${file.id}')" 
                        class="text-blue-600 hover:text-blue-700 transition">
                    <i class="fas fa-upload"></i>
                </button>
            `;
        }
        
        if (file.status === 'uploading') {
            actions += `
                <button onclick="fileUploadManager.cancelUpload('${file.id}')" 
                        class="text-red-600 hover:text-red-700 transition">
                    <i class="fas fa-stop"></i>
                </button>
            `;
        }
        
        if (file.status === 'failed') {
            actions += `
                <button onclick="fileUploadManager.retryUpload('${file.id}')" 
                        class="retry-button text-orange-600 hover:text-orange-700 transition">
                    <i class="fas fa-redo"></i>
                </button>
            `;
        }
        
        if (file.status === 'completed') {
            actions += `
                <button onclick="fileUploadManager.viewFile('${file.id}')" 
                        class="text-green-600 hover:text-green-700 transition">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            `;
        }
        
        actions += `
            <button onclick="fileUploadManager.removeFile('${file.id}')" 
                    class="text-gray-600 hover:text-gray-700 transition">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        return actions;
    }
    
    getStatusIcon(status) {
        const icons = {
            pending: '<i class="fas fa-clock mr-1"></i>',
            uploading: '<i class="fas fa-spinner fa-spin mr-1"></i>',
            completed: '<i class="fas fa-check-circle mr-1"></i>',
            failed: '<i class="fas fa-exclamation-circle mr-1"></i>',
            cancelled: '<i class="fas fa-times-circle mr-1"></i>'
        };
        return icons[status] || icons.pending;
    }
    
    getStatusColor(status) {
        const colors = {
            pending: 'text-yellow-600',
            uploading: 'text-blue-600',
            completed: 'text-green-600',
            failed: 'text-red-600',
            cancelled: 'text-gray-600'
        };
        return colors[status] || colors.pending;
    }
    
    getFileIcon(type) {
        if (type.startsWith('image/')) return 'fas fa-image text-blue-500';
        if (type === 'application/pdf') return 'fas fa-file-pdf text-red-500';
        if (type.includes('word')) return 'fas fa-file-word text-blue-600';
        if (type === 'text/plain') return 'fas fa-file-alt text-gray-500';
        if (type.includes('zip') || type.includes('rar')) return 'fas fa-file-archive text-yellow-500';
        return 'fas fa-file text-gray-500';
    }
    
    uploadFile(fileId) {
        const file = this.files.get(fileId);
        if (!file || file.status === 'uploading') return;
        
        if (this.activeUploads.size >= this.settings.concurrentUploads) {
            this.showToast('Maximum concurrent uploads reached', 'warning');
            return;
        }
        
        if (this.isPaused) {
            this.showToast('Upload is paused', 'warning');
            return;
        }
        
        this.activeUploads.add(fileId);
        file.status = 'uploading';
        file.progress = 0;
        
        this.updateFileItem(fileId);
        this.updateStats();
        
        const formData = new FormData();
        formData.append('file', file.file);
        formData.append('fileId', fileId);
        formData.append('timestamp', Date.now());
        
        const xhr = new XMLHttpRequest();
        file.xhr = xhr;
        
        // Progress tracking
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                file.progress = Math.round((e.loaded / e.total) * 100);
                this.updateFileItem(fileId);
                this.updateStats();
            }
        });
        
        // Completion handling
        xhr.addEventListener('load', () => {
            this.handleUploadComplete(fileId, xhr);
        });
        
        // Error handling
        xhr.addEventListener('error', () => {
            this.handleUploadError(fileId, 'Network error occurred');
        });
        
        xhr.addEventListener('timeout', () => {
            this.handleUploadError(fileId, 'Upload timeout');
        });
        
        xhr.open('POST', '/api/upload/file');
        xhr.timeout = 30000; // 30 seconds timeout
        xhr.send(formData);
    }
    
    handleUploadComplete(fileId, xhr) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        this.activeUploads.delete(fileId);
        
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    file.status = 'completed';
                    file.uploadUrl = response.url;
                    file.progress = 100;
                    this.completedUploads.add(fileId);
                    this.showToast(`"${file.name}" uploaded successfully`, 'success');
                } else {
                    this.handleUploadError(fileId, response.error || 'Upload failed');
                }
            } catch (e) {
                this.handleUploadError(fileId, 'Invalid response from server');
            }
        } else {
            this.handleUploadError(fileId, `Server error: ${xhr.status}`);
        }
        
        this.updateFileItem(fileId);
        this.updateStats();
        this.processQueue();
    }
    
    handleUploadError(fileId, error) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        this.activeUploads.delete(fileId);
        file.status = 'failed';
        file.error = error;
        this.failedUploads.add(fileId);
        
        this.showToast(`Upload failed: ${error}`, 'error');
        this.updateFileItem(fileId);
        this.updateStats();
        
        // Auto retry if enabled
        if (this.settings.autoRetry && file.retryCount < this.settings.retryAttempts) {
            setTimeout(() => {
                this.retryUpload(fileId);
            }, this.settings.retryDelay);
        }
        
        this.processQueue();
    }
    
    retryUpload(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        file.retryCount++;
        file.status = 'pending';
        file.error = null;
        file.progress = 0;
        
        this.failedUploads.delete(fileId);
        this.updateFileItem(fileId);
        this.uploadFile(fileId);
    }
    
    cancelUpload(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        if (file.xhr) {
            file.xhr.abort();
        }
        
        this.activeUploads.delete(fileId);
        file.status = 'cancelled';
        
        this.updateFileItem(fileId);
        this.updateStats();
        this.processQueue();
    }
    
    removeFile(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        // Cancel upload if in progress
        if (file.status === 'uploading') {
            this.cancelUpload(fileId);
        }
        
        // Remove from sets
        this.activeUploads.delete(fileId);
        this.completedUploads.delete(fileId);
        this.failedUploads.delete(fileId);
        
        // Remove from queue
        const queueIndex = this.uploadQueue.indexOf(fileId);
        if (queueIndex > -1) {
            this.uploadQueue.splice(queueIndex, 1);
        }
        
        // Remove from files map
        this.files.delete(fileId);
        
        this.renderQueue();
        this.updateStats();
    }
    
    uploadAll() {
        const pendingFiles = Array.from(this.files.values())
            .filter(file => file.status === 'pending')
            .map(file => file.id);
        
        pendingFiles.forEach(fileId => {
            this.uploadFile(fileId);
        });
    }
    
    clearAll() {
        if (this.files.size === 0) {
            this.showToast('No files to clear', 'info');
            return;
        }
        
        if (confirm('Are you sure you want to clear all files from the queue?')) {
            this.files.clear();
            this.uploadQueue = [];
            this.activeUploads.clear();
            this.completedUploads.clear();
            this.failedUploads.clear();
            
            this.renderQueue();
            this.updateStats();
            this.showToast('All files cleared from queue', 'success');
        }
    }
    
    retryFailed() {
        const failedFiles = Array.from(this.files.values())
            .filter(file => file.status === 'failed')
            .map(file => file.id);
        
        if (failedFiles.length === 0) {
            this.showToast('No failed uploads to retry', 'info');
            return;
        }
        
        failedFiles.forEach(fileId => {
            this.retryUpload(fileId);
        });
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        
        const btn = this.elements.pauseBtn;
        if (this.isPaused) {
            btn.innerHTML = '<i class="fas fa-play mr-1"></i>Resume';
            btn.classList.remove('text-gray-500');
            btn.classList.add('text-green-600');
            this.showToast('Upload paused', 'info');
        } else {
            btn.innerHTML = '<i class="fas fa-pause mr-1"></i>Pause';
            btn.classList.remove('text-green-600');
            btn.classList.add('text-gray-500');
            this.showToast('Upload resumed', 'info');
            this.processQueue();
        }
    }
    
    processQueue() {
        if (this.isPaused) return;
        
        const pendingFiles = Array.from(this.files.values())
            .filter(file => file.status === 'pending')
            .map(file => file.id);
        
        const availableSlots = this.settings.concurrentUploads - this.activeUploads.size;
        const toUpload = pendingFiles.slice(0, availableSlots);
        
        toUpload.forEach(fileId => {
            this.uploadFile(fileId);
        });
    }
    
    filterFiles() {
        this.renderQueue();
    }
    
    updateFileItem(fileId) {
        const file = this.files.get(fileId);
        if (!file) return;
        
        const item = document.querySelector(`[data-file-id="${fileId}"]`);
        if (item) {
            const newHtml = this.renderFileItem(file);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newHtml;
            const newItem = tempDiv.firstElementChild;
            item.replaceWith(newItem);
        }
    }
    
    updateStats() {
        const total = this.files.size;
        const uploaded = this.completedUploads.size;
        const failed = this.failedUploads.size;
        
        let totalSize = 0;
        this.files.forEach(file => {
            totalSize += file.size;
        });
        
        this.elements.totalFiles.textContent = total;
        this.elements.uploadedFiles.textContent = uploaded;
        this.elements.failedFiles.textContent = failed;
        this.elements.totalSize.textContent = this.formatFileSize(totalSize);
    }
    
    updateSetting(setting) {
        const value = this.elements[setting].value;
        if (setting === 'maxFileSize') {
            this.settings.maxFileSize = parseInt(value) * 1024 * 1024;
        } else if (setting === 'concurrentUploads') {
            this.settings.concurrentUploads = parseInt(value);
        } else if (setting === 'autoRetry') {
            this.settings.autoRetry = this.elements.autoRetry.checked;
        } else if (setting === 'generatePreviews') {
            this.settings.generatePreviews = this.elements.generatePreviews.checked;
        }
        
        localStorage.setItem('uploadSettings', JSON.stringify(this.settings));
    }
    
    loadSettings() {
        const saved = localStorage.getItem('uploadSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
            
            // Update UI
            this.elements.maxFileSize.value = this.settings.maxFileSize / (1024 * 1024);
            this.elements.concurrentUploads.value = this.settings.concurrentUploads;
            this.elements.autoRetry.checked = this.settings.autoRetry;
            this.elements.generatePreviews.checked = this.settings.generatePreviews;
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-notification bg-white rounded-lg shadow-lg p-4 mb-2 min-w-[300px]`;
        
        const icons = {
            success: 'fa-check-circle text-green-500',
            error: 'fa-exclamation-circle text-red-500',
            warning: 'fa-exclamation-triangle text-yellow-500',
            info: 'fa-info-circle text-blue-500'
        };
        
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${icons[type]} mr-3 text-xl"></i>
                <div class="flex-1">
                    <p class="text-gray-900 font-medium">${message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" 
                        class="text-gray-400 hover:text-gray-600 ml-3">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
    
    viewPreview(fileId) {
        const file = this.files.get(fileId);
        if (!file || !file.preview) return;
        
        // Create modal to show full preview
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
        modal.onclick = () => modal.remove();
        
        modal.innerHTML = `
            <div class="max-w-4xl max-h-[90vh] overflow-auto">
                <img src="${file.preview}" alt="${file.name}" 
                     class="max-w-full max-h-full rounded-lg">
                <div class="text-center mt-4">
                    <p class="text-white font-medium">${file.name}</p>
                    <p class="text-gray-300 text-sm">${this.formatFileSize(file.size)}</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    viewFile(fileId) {
        const file = this.files.get(fileId);
        if (!file || !file.uploadUrl) return;
        
        window.open(file.uploadUrl, '_blank');
    }
}

// Initialize file upload manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fileUploadManager = new FileUploadManager();
});
