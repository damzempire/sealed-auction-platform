// Global variables
let socket = io();
let currentUser = null;
let currentAuctionId = null;
let isLoginMode = true;

// Validation utility functions
const ValidationRules = {
    username: {
        required: true,
        minLength: 3,
        maxLength: 20,
        pattern: /^[a-zA-Z0-9_]+$/,
        messages: {
            required: 'Username is required',
            minLength: 'Username must be at least 3 characters long',
            maxLength: 'Username cannot exceed 20 characters',
            pattern: 'Username can only contain letters, numbers, and underscores'
        }
    },
    password: {
        required: true,
        minLength: 6,
        maxLength: 100,
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        messages: {
            required: 'Password is required',
            minLength: 'Password must be at least 6 characters long',
            maxLength: 'Password cannot exceed 100 characters',
            pattern: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        }
    },
    auctionTitle: {
        required: true,
        minLength: 5,
        maxLength: 100,
        messages: {
            required: 'Auction title is required',
            minLength: 'Title must be at least 5 characters long',
            maxLength: 'Title cannot exceed 100 characters'
        }
    },
    auctionDescription: {
        required: true,
        minLength: 10,
        maxLength: 1000,
        messages: {
            required: 'Description is required',
            minLength: 'Description must be at least 10 characters long',
            maxLength: 'Description cannot exceed 1000 characters'
        }
    },
    startingBid: {
        required: true,
        min: 0.01,
        max: 1000000,
        messages: {
            required: 'Starting bid is required',
            min: 'Starting bid must be at least $0.01',
            max: 'Starting bid cannot exceed $1,000,000'
        }
    },
    endTime: {
        required: true,
        future: true,
        minHoursFromNow: 1,
        maxDaysFromNow: 30,
        messages: {
            required: 'End time is required',
            future: 'End time must be in the future',
            minHoursFromNow: 'Auction must run for at least 1 hour',
            maxDaysFromNow: 'Auction cannot run longer than 30 days'
        }
    },
    bidAmount: {
        required: true,
        min: 0.01,
        max: 10000000,
        messages: {
            required: 'Bid amount is required',
            min: 'Bid amount must be at least $0.01',
            max: 'Bid amount cannot exceed $10,000,000'
        }
    },
    secretKey: {
        required: true,
        minLength: 8,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/,
        messages: {
            required: 'Secret key is required',
            minLength: 'Secret key must be at least 8 characters long',
            maxLength: 'Secret key cannot exceed 100 characters',
            pattern: 'Secret key contains invalid characters'
        }
    }
};

// Validation functions
function validateField(value, rules) {
    const errors = [];
    
    // Required validation
    if (rules.required && (!value || value.trim() === '')) {
        errors.push(rules.messages.required);
        return errors;
    }
    
    // Skip other validations if field is empty and not required
    if (!value || value.trim() === '') {
        return errors;
    }
    
    // Length validations
    if (rules.minLength && value.length < rules.minLength) {
        errors.push(rules.messages.minLength);
    }
    
    if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(rules.messages.maxLength);
    }
    
    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(rules.messages.pattern);
    }
    
    // Numeric validations
    if (rules.min !== undefined) {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < rules.min) {
            errors.push(rules.messages.min);
        }
    }
    
    if (rules.max !== undefined) {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue > rules.max) {
            errors.push(rules.messages.max);
        }
    }
    
    // Date/time validations
    if (rules.future) {
        const dateValue = new Date(value);
        if (isNaN(dateValue.getTime()) || dateValue <= new Date()) {
            errors.push(rules.messages.future);
        }
    }
    
    if (rules.minHoursFromNow) {
        const dateValue = new Date(value);
        const minDate = new Date();
        minDate.setHours(minDate.getHours() + rules.minHoursFromNow);
        if (isNaN(dateValue.getTime()) || dateValue < minDate) {
            errors.push(rules.messages.minHoursFromNow);
        }
    }
    
    if (rules.maxDaysFromNow) {
        const dateValue = new Date(value);
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + rules.maxDaysFromNow);
        if (isNaN(dateValue.getTime()) || dateValue > maxDate) {
            errors.push(rules.messages.maxDaysFromNow);
        }
    }
    
    return errors;
}

function showError(fieldId, errors) {
    const field = document.getElementById(fieldId);
    const existingError = field.parentNode.querySelector('.error-message');
    
    // Remove existing error
    if (existingError) {
        existingError.remove();
    }
    
    // Add error styling
    field.classList.add('border-red-500', 'bg-red-500', 'bg-opacity-20');
    field.classList.remove('border-white', 'border-opacity-30');
    
    // Create and add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message text-red-400 text-sm mt-1 flex items-center';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i> ${errors.join(', ')}`;
    field.parentNode.appendChild(errorDiv);
}

function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    const existingError = field.parentNode.querySelector('.error-message');
    
    // Remove error styling
    field.classList.remove('border-red-500', 'bg-red-500', 'bg-opacity-20');
    field.classList.add('border-white', 'border-opacity-30');
    
    // Remove error message
    if (existingError) {
        existingError.remove();
    }
}

function clearAllErrors(formId) {
    const form = document.getElementById(formId);
    form.querySelectorAll('.error-message').forEach(error => error.remove());
    form.querySelectorAll('input, textarea').forEach(field => {
        field.classList.remove('border-red-500', 'bg-red-500', 'bg-opacity-20');
        field.classList.add('border-white', 'border-opacity-30');
    });
}

// Real-time validation
function setupRealtimeValidation() {
    // Username validation
    const usernameField = document.getElementById('username');
    if (usernameField) {
        usernameField.addEventListener('blur', () => {
            const errors = validateField(usernameField.value, ValidationRules.username);
            if (errors.length > 0) {
                showError('username', errors);
            } else {
                clearError('username');
            }
        });
    }
    
    // Password validation
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('blur', () => {
            const errors = validateField(passwordField.value, ValidationRules.password);
            if (errors.length > 0) {
                showError('password', errors);
            } else {
                clearError('password');
            }
        });
    }
    
    // Auction title validation
    const auctionTitleField = document.getElementById('auctionTitle');
    if (auctionTitleField) {
        auctionTitleField.addEventListener('blur', () => {
            const errors = validateField(auctionTitleField.value, ValidationRules.auctionTitle);
            if (errors.length > 0) {
                showError('auctionTitle', errors);
            } else {
                clearError('auctionTitle');
            }
        });
    }
    
    // Auction description validation
    const auctionDescField = document.getElementById('auctionDescription');
    if (auctionDescField) {
        auctionDescField.addEventListener('blur', () => {
            const errors = validateField(auctionDescField.value, ValidationRules.auctionDescription);
            if (errors.length > 0) {
                showError('auctionDescription', errors);
            } else {
                clearError('auctionDescription');
            }
        });
    }
    
    // Starting bid validation
    const startingBidField = document.getElementById('startingBid');
    if (startingBidField) {
        startingBidField.addEventListener('blur', () => {
            const errors = validateField(startingBidField.value, ValidationRules.startingBid);
            if (errors.length > 0) {
                showError('startingBid', errors);
            } else {
                clearError('startingBid');
            }
        });
    }
    
    // End time validation
    const endTimeField = document.getElementById('endTime');
    if (endTimeField) {
        endTimeField.addEventListener('blur', () => {
            const errors = validateField(endTimeField.value, ValidationRules.endTime);
            if (errors.length > 0) {
                showError('endTime', errors);
            } else {
                clearError('endTime');
            }
        });
    }
    
    // Bid amount validation
    const bidAmountField = document.getElementById('bidAmount');
    if (bidAmountField) {
        bidAmountField.addEventListener('blur', () => {
            const errors = validateField(bidAmountField.value, ValidationRules.bidAmount);
            if (errors.length > 0) {
                showError('bidAmount', errors);
            } else {
                clearError('bidAmount');
            }
        });
    }
    
    // Secret key validation
    const secretKeyField = document.getElementById('secretKey');
    if (secretKeyField) {
        secretKeyField.addEventListener('blur', () => {
            const errors = validateField(secretKeyField.value, ValidationRules.secretKey);
            if (errors.length > 0) {
                showError('secretKey', errors);
            } else {
                clearError('secretKey');
            }
        });
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadAuctions();
    setupEventListeners();
    setupSocketListeners();
    setupRealtimeValidation();
});

// Socket.io listeners
function setupSocketListeners() {
    socket.on('auctionCreated', (auction) => {
        showNotification('New auction created: ' + auction.title, 'success');
        loadAuctions();
    });
    
    socket.on('auctionClosed', (auction) => {
        showNotification('Auction closed: ' + auction.title, 'info');
        loadAuctions();
    });
    
    socket.on('bidPlaced', (data) => {
        showNotification('New bid placed!', 'info');
        loadAuctions();
    });
}

// Event listeners
function setupEventListeners() {
    // Auth form
    document.getElementById('authForm').addEventListener('submit', handleAuth);
    
    // Create auction form
    document.getElementById('createAuctionForm').addEventListener('submit', handleCreateAuction);
    
    // Bid form
    document.getElementById('bidForm').addEventListener('submit', handlePlaceBid);
    
    // Set minimum end time to current time
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    document.getElementById('endTime').min = now.toISOString().slice(0, 16);
}

// Authentication functions
function toggleAuth() {
    const modal = document.getElementById('authModal');
    modal.classList.toggle('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('authForm').reset();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('authTitle');
    const submitText = document.getElementById('authSubmitText');
    const modeText = document.getElementById('authModeText');
    
    if (isLoginMode) {
        title.textContent = 'Login';
        submitText.textContent = 'Login';
        modeText.textContent = 'Register';
    } else {
        title.textContent = 'Register';
        submitText.textContent = 'Register';
        modeText.textContent = 'Login';
    }
}

async function handleAuth(e) {
    e.preventDefault();
    
    // Clear previous errors
    clearAllErrors('authForm');
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Validate username
    const usernameErrors = validateField(username, ValidationRules.username);
    if (usernameErrors.length > 0) {
        showError('username', usernameErrors);
        return;
    }
    
    // Validate password
    const passwordErrors = validateField(password, ValidationRules.password);
    if (passwordErrors.length > 0) {
        showError('password', passwordErrors);
        return;
    }
    
    const endpoint = isLoginMode ? '/api/users/login' : '/api/users/register';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data;
            updateUserDisplay();
            closeAuthModal();
            showNotification(isLoginMode ? 'Login successful!' : 'Registration successful!', 'success');
        } else {
            showNotification(data.error || 'Authentication failed', 'error');
        }
    } catch (error) {
        showNotification('Network error', 'error');
    }
}

function updateUserDisplay() {
    const userDisplay = document.getElementById('userDisplay');
    const authBtn = document.getElementById('authBtn');
    
    if (currentUser) {
        userDisplay.textContent = `Welcome, ${currentUser.username}`;
        userDisplay.classList.remove('hidden');
        authBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Logout';
        authBtn.onclick = logout;
    } else {
        userDisplay.classList.add('hidden');
        authBtn.innerHTML = '<i class="fas fa-user mr-2"></i>Login';
        authBtn.onclick = toggleAuth;
    }
}

function logout() {
    currentUser = null;
    updateUserDisplay();
    showNotification('Logged out successfully', 'info');
    loadAuctions();
}

// Tab functions
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active state from all tab buttons
    document.querySelectorAll('[id$="Tab"]').forEach(btn => {
        btn.classList.remove('bg-purple-600');
        btn.classList.add('hover:bg-purple-500');
    });
    
    // Show selected tab
    document.getElementById(tabName + 'Content').classList.remove('hidden');
    
    // Add active state to selected tab button
    const activeTab = document.getElementById(tabName + 'Tab');
    activeTab.classList.add('bg-purple-600');
    activeTab.classList.remove('hover:bg-purple-500');
    
    // Load tab-specific content
    if (tabName === 'auctions') {
        loadAuctions();
    } else if (tabName === 'myBids') {
        loadMyBids();
    }
}

// Auction functions
async function loadAuctions() {
    try {
        const response = await fetch('/api/auctions');
        const auctions = await response.json();
        
        const grid = document.getElementById('auctionsGrid');
        grid.innerHTML = '';
        
        auctions.forEach(auction => {
            const card = createAuctionCard(auction);
            grid.appendChild(card);
        });
    } catch (error) {
        showNotification('Failed to load auctions', 'error');
    }
}

function createAuctionCard(auction) {
    const card = document.createElement('div');
    card.className = 'glass-effect rounded-xl p-6 hover:transform hover:scale-105 transition';
    
    const endTime = new Date(auction.endTime);
    const now = new Date();
    const isExpired = endTime <= now;
    const statusColor = auction.status === 'active' && !isExpired ? 'green' : 'red';
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <h3 class="text-xl font-bold">${auction.title}</h3>
            <span class="px-2 py-1 rounded text-xs bg-${statusColor}-500 bg-opacity-30 border border-${statusColor}-500">
                ${auction.status}
            </span>
        </div>
        <p class="text-gray-300 mb-4">${auction.description}</p>
        <div class="space-y-2 mb-4">
            <div class="flex justify-between">
                <span>Starting Bid:</span>
                <span class="font-semibold">$${auction.startingBid.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
                <span>Current Highest:</span>
                <span class="font-semibold text-green-400">$${auction.currentHighestBid.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
                <span>Bids:</span>
                <span class="font-semibold">${auction.bidCount}</span>
            </div>
            <div class="flex justify-between">
                <span>Ends:</span>
                <span class="text-sm">${endTime.toLocaleString()}</span>
            </div>
        </div>
        ${auction.winner ? `
            <div class="bg-green-500 bg-opacity-20 border border-green-500 rounded-lg p-3 mb-4">
                <p class="text-sm"><strong>Winner:</strong> ${auction.winner}</p>
                <p class="text-sm"><strong>Winning Bid:</strong> $${auction.winningBid.amount.toFixed(2)}</p>
            </div>
        ` : ''}
        <div class="flex space-x-2">
            ${auction.status === 'active' && !isExpired && currentUser ? `
                <button onclick="openBidModal('${auction.id}')" class="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg transition">
                    <i class="fas fa-gavel mr-2"></i>Place Bid
                </button>
            ` : ''}
            <button onclick="viewAuctionDetails('${auction.id}')" class="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded-lg transition">
                <i class="fas fa-eye mr-2"></i>Details
            </button>
        </div>
    `;
    
    return card;
}

async function handleCreateAuction(e) {
    e.preventDefault();
    
    // Clear previous errors
    clearAllErrors('createAuctionForm');
    
    if (!currentUser) {
        showNotification('Please login to create an auction', 'error');
        return;
    }
    
    const title = document.getElementById('auctionTitle').value;
    const description = document.getElementById('auctionDescription').value;
    const startingBid = parseFloat(document.getElementById('startingBid').value);
    const endTime = document.getElementById('endTime').value;
    
    // Validate title
    const titleErrors = validateField(title, ValidationRules.auctionTitle);
    if (titleErrors.length > 0) {
        showError('auctionTitle', titleErrors);
        return;
    }
    
    // Validate description
    const descriptionErrors = validateField(description, ValidationRules.auctionDescription);
    if (descriptionErrors.length > 0) {
        showError('auctionDescription', descriptionErrors);
        return;
    }
    
    // Validate starting bid
    const startingBidErrors = validateField(document.getElementById('startingBid').value, ValidationRules.startingBid);
    if (startingBidErrors.length > 0) {
        showError('startingBid', startingBidErrors);
        return;
    }
    
    // Validate end time
    const endTimeErrors = validateField(endTime, ValidationRules.endTime);
    if (endTimeErrors.length > 0) {
        showError('endTime', endTimeErrors);
        return;
    }
    
    try {
        const response = await fetch('/api/auctions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                description,
                startingBid,
                endTime,
                userId: currentUser.userId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Auction created successfully!', 'success');
            document.getElementById('createAuctionForm').reset();
            showTab('auctions');
        } else {
            showNotification(data.error || 'Failed to create auction', 'error');
        }
    } catch (error) {
        showNotification('Network error', 'error');
    }
}

// Bid functions
function openBidModal(auctionId) {
    if (!currentUser) {
        showNotification('Please login to place a bid', 'error');
        return;
    }
    
    currentAuctionId = auctionId;
    document.getElementById('bidModal').classList.remove('hidden');
}

function closeBidModal() {
    document.getElementById('bidModal').classList.add('hidden');
    document.getElementById('bidForm').reset();
    currentAuctionId = null;
}

async function handlePlaceBid(e) {
    e.preventDefault();
    
    // Clear previous errors
    clearAllErrors('bidForm');
    
    const amount = parseFloat(document.getElementById('bidAmount').value);
    const secretKey = document.getElementById('secretKey').value;
    
    // Validate bid amount
    const amountErrors = validateField(document.getElementById('bidAmount').value, ValidationRules.bidAmount);
    if (amountErrors.length > 0) {
        showError('bidAmount', amountErrors);
        return;
    }
    
    // Validate secret key
    const secretKeyErrors = validateField(secretKey, ValidationRules.secretKey);
    if (secretKeyErrors.length > 0) {
        showError('secretKey', secretKeyErrors);
        return;
    }
    
    try {
        const response = await fetch('/api/bids', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                auctionId: currentAuctionId,
                bidderId: currentUser.userId,
                amount,
                secretKey
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Bid placed successfully! Save your secret key securely.', 'success');
            closeBidModal();
            loadAuctions();
        } else {
            showNotification(data.error || 'Failed to place bid', 'error');
        }
    } catch (error) {
        showNotification('Network error', 'error');
    }
}

async function viewAuctionDetails(auctionId) {
    try {
        const response = await fetch(`/api/auctions/${auctionId}`);
        const auction = await response.json();
        
        // Show detailed view (could be enhanced with a modal)
        showNotification(`Viewing details for: ${auction.title}`, 'info');
    } catch (error) {
        showNotification('Failed to load auction details', 'error');
    }
}

async function loadMyBids() {
    if (!currentUser) {
        document.getElementById('myBidsList').innerHTML = '<p>Please login to view your bids.</p>';
        return;
    }
    
    // This would require an additional endpoint to get user's bids
    // For now, show a placeholder
    document.getElementById('myBidsList').innerHTML = '<p>Your bid history will appear here.</p>';
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg glass-effect animate-pulse-slow`;
    
    const colors = {
        success: 'bg-green-500 bg-opacity-20 border-green-500',
        error: 'bg-red-500 bg-opacity-20 border-red-500',
        info: 'bg-blue-500 bg-opacity-20 border-blue-500'
    };
    
    notification.classList.add(...colors[type].split(' '));
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
