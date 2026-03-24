// Global variables
let socket = io();
let currentUser = null;
let currentAuctionId = null;
let isLoginMode = true;

// Form validation configuration
const validationRules = {
    username: {
        required: true,
        minLength: 3,
        maxLength: 20,
        pattern: /^[a-zA-Z0-9_]+$/,
        message: 'Username must be 3-20 characters, alphanumeric and underscores only'
    },
    password: {
        required: true,
        minLength: 6,
        maxLength: 100,
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        message: 'Password must be 6+ characters with uppercase, lowercase, and number'
    },
    auctionTitle: {
        required: true,
        minLength: 3,
        maxLength: 100,
        message: 'Title must be 3-100 characters'
    },
    auctionDescription: {
        required: true,
        minLength: 10,
        maxLength: 1000,
        message: 'Description must be 10-1000 characters'
    },
    startingBid: {
        required: true,
        min: 0.01,
        max: 1000000,
        message: 'Starting bid must be between $0.01 and $1,000,000'
    },
    endTime: {
        required: true,
        future: true,
        message: 'End time must be at least 1 hour in the future'
    },
    bidAmount: {
        required: true,
        min: 0.01,
        max: 1000000,
        message: 'Bid amount must be between $0.01 and $1,000,000'
    },
    secretKey: {
        required: true,
        minLength: 8,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/,
        message: 'Secret key must be 8-100 characters'
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadAuctions();
    setupEventListeners();
    setupSocketListeners();
    setupRealTimeValidation();
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
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    
    // Clear previous errors
    clearFieldErrors(['username', 'password']);
    
    // Validate fields
    const usernameError = validateField('username', username.value);
    const passwordError = validateField('password', password.value);
    
    if (usernameError) {
        showFieldError('username', usernameError);
        return;
    }
    
    if (passwordError) {
        showFieldError('password', passwordError);
        return;
    }
    
    const endpoint = isLoginMode ? '/api/users/login' : '/api/users/register';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: username.value, password: password.value })
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
    card.className = 'glass-effect rounded-xl p-4 sm:p-6 hover:transform hover:scale-105 transition';
    
    const endTime = new Date(auction.endTime);
    const now = new Date();
    const isExpired = endTime <= now;
    const statusColor = auction.status === 'active' && !isExpired ? 'green' : 'red';
    
    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 space-y-2 sm:space-y-0">
            <h3 class="text-lg sm:text-xl font-bold truncate flex-1 pr-2">${auction.title}</h3>
            <span class="px-2 py-1 rounded text-xs bg-${statusColor}-500 bg-opacity-30 border border-${statusColor}-500 flex-shrink-0">
                ${auction.status}
            </span>
        </div>
        <p class="text-gray-300 mb-4 text-sm sm:text-base line-clamp-3">${auction.description}</p>
        <div class="space-y-2 mb-4 text-sm sm:text-base">
            <div class="flex justify-between">
                <span class="truncate pr-2">Starting Bid:</span>
                <span class="font-semibold flex-shrink-0">$${auction.startingBid.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
                <span class="truncate pr-2">Current Highest:</span>
                <span class="font-semibold text-green-400 flex-shrink-0">$${auction.currentHighestBid.toFixed(2)}</span>
            </div>
            <div class="flex justify-between">
                <span class="truncate pr-2">Bids:</span>
                <span class="font-semibold flex-shrink-0">${auction.bidCount}</span>
            </div>
            <div class="flex justify-between">
                <span class="truncate pr-2">Ends:</span>
                <span class="text-xs sm:text-sm flex-shrink-0">${endTime.toLocaleString()}</span>
            </div>
        </div>
        ${auction.winner ? `
            <div class="bg-green-500 bg-opacity-20 border border-green-500 rounded-lg p-3 mb-4">
                <p class="text-xs sm:text-sm"><strong>Winner:</strong> ${auction.winner}</p>
                <p class="text-xs sm:text-sm"><strong>Winning Bid:</strong> $${auction.winningBid.amount.toFixed(2)}</p>
            </div>
        ` : ''}
        <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            ${auction.status === 'active' && !isExpired && currentUser ? `
                <button onclick="openBidModal('${auction.id}')" class="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg transition text-sm sm:text-base">
                    <i class="fas fa-gavel mr-2"></i>Place Bid
                </button>
            ` : ''}
            <button onclick="viewAuctionDetails('${auction.id}')" class="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded-lg transition text-sm sm:text-base">
                <i class="fas fa-eye mr-2"></i>Details
            </button>
        </div>
    `;
    
    return card;
}

async function handleCreateAuction(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification('Please login to create an auction', 'error');
        return;
    }
    
    const title = document.getElementById('auctionTitle');
    const description = document.getElementById('auctionDescription');
    const startingBid = document.getElementById('startingBid');
    const endTime = document.getElementById('endTime');
    
    // Clear previous errors
    clearFieldErrors(['auctionTitle', 'auctionDescription', 'startingBid', 'endTime']);
    
    // Validate fields
    const titleError = validateField('auctionTitle', title.value);
    const descriptionError = validateField('auctionDescription', description.value);
    const startingBidError = validateField('startingBid', parseFloat(startingBid.value));
    const endTimeError = validateField('endTime', endTime.value);
    
    if (titleError) {
        showFieldError('auctionTitle', titleError);
        return;
    }
    
    if (descriptionError) {
        showFieldError('auctionDescription', descriptionError);
        return;
    }
    
    if (startingBidError) {
        showFieldError('startingBid', startingBidError);
        return;
    }
    
    if (endTimeError) {
        showFieldError('endTime', endTimeError);
        return;
    }
    
    try {
        const response = await fetch('/api/auctions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title.value,
                description: description.value,
                startingBid: parseFloat(startingBid.value),
                endTime: endTime.value,
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
    
    const amount = document.getElementById('bidAmount');
    const secretKey = document.getElementById('secretKey');
    
    // Clear previous errors
    clearFieldErrors(['bidAmount', 'secretKey']);
    
    // Validate fields
    const amountError = validateField('bidAmount', parseFloat(amount.value));
    const secretKeyError = validateField('secretKey', secretKey.value);
    
    if (amountError) {
        showFieldError('bidAmount', amountError);
        return;
    }
    
    if (secretKeyError) {
        showFieldError('secretKey', secretKeyError);
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
                amount: parseFloat(amount.value),
                secretKey: secretKey.value
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

// Form validation functions
function validateField(fieldName, value) {
    const rules = validationRules[fieldName];
    if (!rules) return null;
    
    // Check if required
    if (rules.required && (!value || value.toString().trim() === '')) {
        return 'This field is required';
    }
    
    // Skip other validations if field is empty and not required
    if (!value || value.toString().trim() === '') {
        return null;
    }
    
    const stringValue = value.toString();
    
    // Check minimum length
    if (rules.minLength && stringValue.length < rules.minLength) {
        return rules.message || `Must be at least ${rules.minLength} characters`;
    }
    
    // Check maximum length
    if (rules.maxLength && stringValue.length > rules.maxLength) {
        return rules.message || `Must be no more than ${rules.maxLength} characters`;
    }
    
    // Check pattern
    if (rules.pattern && !rules.pattern.test(stringValue)) {
        return rules.message || 'Invalid format';
    }
    
    // Check minimum value (for numbers)
    if (rules.min !== undefined && parseFloat(value) < rules.min) {
        return rules.message || `Must be at least ${rules.min}`;
    }
    
    // Check maximum value (for numbers)
    if (rules.max !== undefined && parseFloat(value) > rules.max) {
        return rules.message || `Must be no more than ${rules.max}`;
    }
    
    // Check future date
    if (rules.future) {
        const selectedDate = new Date(value);
        const now = new Date();
        const minFutureTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
        
        if (selectedDate <= minFutureTime) {
            return rules.message || 'Must be at least 1 hour in the future';
        }
    }
    
    return null;
}

function showFieldError(fieldName, errorMessage) {
    const field = document.getElementById(fieldName);
    if (!field) return;
    
    // Remove existing error
    clearFieldError(fieldName);
    
    // Add error styling to field
    field.classList.add('border-red-500', 'focus:ring-red-400');
    field.classList.remove('border-white', 'border-opacity-30', 'focus:ring-purple-400');
    
    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.id = `${fieldName}Error`;
    errorElement.className = 'text-red-400 text-sm mt-1 flex items-center';
    errorElement.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i>${errorMessage}`;
    
    // Insert error message after the field
    field.parentNode.insertBefore(errorElement, field.nextSibling);
}

function clearFieldError(fieldName) {
    const field = document.getElementById(fieldName);
    const errorElement = document.getElementById(`${fieldName}Error`);
    
    if (field) {
        field.classList.remove('border-red-500', 'focus:ring-red-400');
        field.classList.add('border-white', 'border-opacity-30', 'focus:ring-purple-400');
    }
    
    if (errorElement) {
        errorElement.remove();
    }
}

function clearFieldErrors(fieldNames) {
    fieldNames.forEach(fieldName => clearFieldError(fieldName));
}

// Real-time validation
function setupRealTimeValidation() {
    // Username validation
    const usernameField = document.getElementById('username');
    if (usernameField) {
        usernameField.addEventListener('blur', () => {
            const error = validateField('username', usernameField.value);
            if (error) {
                showFieldError('username', error);
            } else {
                clearFieldError('username');
            }
        });
    }
    
    // Password validation
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('blur', () => {
            const error = validateField('password', passwordField.value);
            if (error) {
                showFieldError('password', error);
            } else {
                clearFieldError('password');
            }
        });
    }
    
    // Auction title validation
    const auctionTitleField = document.getElementById('auctionTitle');
    if (auctionTitleField) {
        auctionTitleField.addEventListener('blur', () => {
            const error = validateField('auctionTitle', auctionTitleField.value);
            if (error) {
                showFieldError('auctionTitle', error);
            } else {
                clearFieldError('auctionTitle');
            }
        });
    }
    
    // Auction description validation
    const auctionDescField = document.getElementById('auctionDescription');
    if (auctionDescField) {
        auctionDescField.addEventListener('blur', () => {
            const error = validateField('auctionDescription', auctionDescField.value);
            if (error) {
                showFieldError('auctionDescription', error);
            } else {
                clearFieldError('auctionDescription');
            }
        });
    }
    
    // Starting bid validation
    const startingBidField = document.getElementById('startingBid');
    if (startingBidField) {
        startingBidField.addEventListener('blur', () => {
            const error = validateField('startingBid', parseFloat(startingBidField.value));
            if (error) {
                showFieldError('startingBid', error);
            } else {
                clearFieldError('startingBid');
            }
        });
    }
    
    // End time validation
    const endTimeField = document.getElementById('endTime');
    if (endTimeField) {
        endTimeField.addEventListener('change', () => {
            const error = validateField('endTime', endTimeField.value);
            if (error) {
                showFieldError('endTime', error);
            } else {
                clearFieldError('endTime');
            }
        });
    }
    
    // Bid amount validation
    const bidAmountField = document.getElementById('bidAmount');
    if (bidAmountField) {
        bidAmountField.addEventListener('blur', () => {
            const error = validateField('bidAmount', parseFloat(bidAmountField.value));
            if (error) {
                showFieldError('bidAmount', error);
            } else {
                clearFieldError('bidAmount');
            }
        });
    }
    
    // Secret key validation
    const secretKeyField = document.getElementById('secretKey');
    if (secretKeyField) {
        secretKeyField.addEventListener('blur', () => {
            const error = validateField('secretKey', secretKeyField.value);
            if (error) {
                showFieldError('secretKey', error);
            } else {
                clearFieldError('secretKey');
            }
        });
    }
}
