// Supabase Configuration
const SUPABASE_URL = 'https://ovgelddnsjwbmqrmakxv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z2VsZGRuc2p3Ym1xcm1ha3h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3OTg1NDcsImV4cCI6MjA3ODM3NDU0N30.upIhYhJTyJH_zyr9ogFxHG8G-sR5gBsvykGG-BIMs5U';

let supabaseClient = null;

// Initialize Supabase client
function initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
            // Check if supabase library is loaded (from CDN)
            if (typeof supabase !== 'undefined') {
                supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('✅ Supabase initialized successfully');
                return true;
            } else {
                console.error('❌ Supabase library not loaded. Check if CDN script is present.');
                return false;
            }
        } catch (e) {
            console.error('❌ Error initializing Supabase:', e);
            return false;
        }
    } else {
        console.warn('⚠️ Supabase credentials not configured.');
        return false;
    }
}

// Wait for DOM and Supabase library to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initSupabase, 100); // Small delay to ensure CDN is loaded
    });
} else {
    setTimeout(initSupabase, 100);
}

// Get references to our HTML elements
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const followupInput = document.getElementById('followup-input');
const followupButton = document.getElementById('followup-button');
const resultsContainer = document.getElementById('results-container');
const chatContainer = document.getElementById('chat-container');
const topSearchBar = document.getElementById('top-search-bar');
const bottomSearchBar = document.getElementById('bottom-search-bar');
const loadingTemplate = document.getElementById('loading-template');
const sidebar = document.getElementById('sidebar');
const sidebarOpen = document.getElementById('sidebar-open');
const sidebarClose = document.getElementById('sidebar-close');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
// const themeToggle = document.getElementById('theme-toggle'); // Temporarily disabled
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginSection = document.getElementById('login-section');
const userInfoSection = document.getElementById('user-info-section');
const creditsDisplay = document.getElementById('credits-display');
const userEmail = document.getElementById('user-email');

let currentSearchId = null;
let searchHistory = [];
let currentUser = null;
let userCredits = 0;
let isFollowupMode = false;
let previousContext = null;

// Initialize theme - force light mode only (dark mode temporarily disabled)
function initTheme() {
    // Always use light mode
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
}

// Initialize theme on load
initTheme();

// Move search bar down after first search
function moveSearchBarDown() {
    topSearchBar.style.display = 'none';
    bottomSearchBar.style.display = 'block';
    isFollowupMode = true;
    followupInput.focus();
}

// Check and update credits
async function updateCredits() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('user_credits')
            .select('credits')
            .eq('user_id', currentUser.id)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching credits:', error);
            return;
        }
        
        userCredits = data?.credits || 0;
        creditsDisplay.textContent = `Credits: ${userCredits}`;
    } catch (e) {
        console.error('Error updating credits:', e);
    }
}

// Deduct credits
async function deductCredit() {
    if (!supabaseClient || !currentUser) return true; // Allow if not logged in
    
    if (userCredits <= 0) {
        alert('You have no credits left. Please purchase more credits.');
        return false;
    }
    
    try {
        const { error } = await supabaseClient
            .from('user_credits')
            .update({ credits: userCredits - 1 })
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        userCredits--;
        creditsDisplay.textContent = `Credits: ${userCredits}`;
        return true;
    } catch (e) {
        console.error('Error deducting credit:', e);
        return false;
    }
}

// Modal handling
const loginModal = document.getElementById('login-modal');
const closeModal = document.getElementById('close-modal');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const signupSuccess = document.getElementById('signup-success');

loginBtn.addEventListener('click', () => {
    loginModal.classList.add('active');
    switchToLogin();
});

closeModal.addEventListener('click', () => {
    loginModal.classList.remove('active');
    clearForms();
});

loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
        loginModal.classList.remove('active');
        clearForms();
    }
});

loginTab.addEventListener('click', () => {
    switchToLogin();
});

signupTab.addEventListener('click', () => {
    switchToSignup();
});

function switchToLogin() {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    clearErrors();
}

function switchToSignup() {
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
    clearErrors();
}

function clearForms() {
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-confirm').value = '';
    clearErrors();
}

function clearErrors() {
    loginError.classList.remove('show');
    signupError.classList.remove('show');
    signupSuccess.classList.remove('show');
    loginError.textContent = '';
    signupError.textContent = '';
}

function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
}

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!supabaseClient) {
        showError(loginError, 'Supabase not configured. Please contact support.');
        return;
    }
    
    const submitBtn = document.getElementById('login-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        loginSection.style.display = 'none';
        userInfoSection.style.display = 'flex';
        userEmail.textContent = currentUser.email;
        
        // Load credits
        await updateCredits();
        
        loginModal.classList.remove('active');
        clearForms();
    } catch (error) {
        showError(loginError, error.message || 'Login failed. Please check your credentials.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
});

// Signup form submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    
    if (password !== confirm) {
        showError(signupError, 'Passwords do not match.');
        return;
    }
    
    if (password.length < 6) {
        showError(signupError, 'Password must be at least 6 characters.');
        return;
    }
    
    if (!supabaseClient) {
        showError(signupError, 'Supabase not configured. Please contact support.');
        return;
    }
    
    const submitBtn = document.getElementById('signup-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';
    
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { credits: 10 }
            }
        });
        
        if (error) throw error;
        
        // Create credits record (trigger should handle this, but just in case)
        try {
            await supabaseClient.from('user_credits').insert({
                user_id: data.user.id,
                credits: 10
            });
        } catch (insertError) {
            // Ignore if already exists (trigger might have created it)
            console.log('Credits record may already exist');
        }
        
        currentUser = data.user;
        userCredits = 10;
        
        signupSuccess.classList.add('show');
        
        // Auto sign in and close modal after a moment
        setTimeout(async () => {
            loginSection.style.display = 'none';
            userInfoSection.style.display = 'flex';
            userEmail.textContent = currentUser.email;
            creditsDisplay.textContent = `Credits: ${userCredits}`;
            
            // Ensure credits are loaded from database
            await updateCredits();
            
            loginModal.classList.remove('active');
            clearForms();
        }, 1500);
    } catch (error) {
        showError(signupError, error.message || 'Sign up failed. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
    }
});

async function handleLogout() {
    if (!supabaseClient) return;
    
    await supabaseClient.auth.signOut();
    currentUser = null;
    userCredits = 0;
    loginSection.style.display = 'block';
    userInfoSection.style.display = 'none';
}

logoutBtn.addEventListener('click', handleLogout);

// Auto sign in check - runs after Supabase is initialized
function checkAutoSignIn() {
    if (!supabaseClient) {
        // Retry after a short delay if Supabase isn't ready
        setTimeout(checkAutoSignIn, 500);
        return;
    }
    
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
            currentUser = session.user;
            loginSection.style.display = 'none';
            userInfoSection.style.display = 'flex';
            userEmail.textContent = currentUser.email;
            updateCredits();
            console.log('✅ Auto signed in user:', currentUser.email);
        }
    });
    
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            loginSection.style.display = 'none';
            userInfoSection.style.display = 'flex';
            userEmail.textContent = currentUser.email;
            updateCredits();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userCredits = 0;
            loginSection.style.display = 'block';
            userInfoSection.style.display = 'none';
        }
    });
}

// Start checking for auto sign in after initialization
setTimeout(checkAutoSignIn, 500);

// Sidebar toggle
sidebarOpen.addEventListener('click', () => {
    sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');
});

sidebarClose.addEventListener('click', () => {
    sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
});

// Load search history from localStorage
function loadHistory() {
    const stored = localStorage.getItem('searchHistory');
    if (stored) {
        searchHistory = JSON.parse(stored);
    }
    renderHistory();
}

// Save search history to localStorage
function saveHistory() {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    renderHistory();
}

// Render history list
function renderHistory() {
    if (searchHistory.length === 0) {
        historyList.innerHTML = '<div class="empty-history">No search history yet</div>';
        return;
    }

    historyList.innerHTML = searchHistory.map((item, index) => {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const isActive = item.id === currentSearchId;
        
        return `
            <div class="history-item ${isActive ? 'active' : ''}" data-id="${item.id}">
                <div class="history-query">${escapeHtml(item.query)}</div>
                <div class="history-date">${dateStr}</div>
                <div class="history-actions">
                    <button class="btn-view" onclick="viewSearch('${item.id}')">View</button>
                    <button class="btn-followup" onclick="showFollowup('${item.id}')">Follow-up</button>
                </div>
                <div class="followup-input-container" id="followup-${item.id}">
                    <input type="text" class="followup-input" id="followup-input-${item.id}" placeholder="Ask a follow-up question...">
                    <div class="followup-buttons">
                        <button class="btn-send-followup" onclick="sendFollowup('${item.id}')">Send</button>
                        <button class="btn-cancel" onclick="hideFollowup('${item.id}')">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// View a previous search (global for onclick)
window.viewSearch = function(id) {
    const item = searchHistory.find(s => s.id === id);
    if (!item) return;

    currentSearchId = id;
    renderHistory();
    
    // Display the previous search result
    const resultHtml = `
        <div class="result">
            ${item.queries_used ? `<div class="queries-section"><strong>Search queries used:</strong> ${item.queries_used.map(q => `<span class="query-tag">${escapeHtml(q)}</span>`).join('')}</div>` : ''}
            <h3>Comprehensive Answer:</h3>
            <div class="result-content">${item.summary ? (typeof marked !== 'undefined' ? marked.parse(item.summary) : item.summary.replace(/\n/g, '<br>')) : 'No answer available.'}</div>
            ${item.sources && item.sources.length > 0 ? `
                <div class="sources-section">
                    <h3>Sources Used:</h3>
                    ${item.sources.map(source => `
                        <div class="source-item">
                            <a href="${source.link}" target="_blank">${escapeHtml(source.title || 'Source')}</a>
                            ${source.snippet ? `<div class="source-snippet">${escapeHtml(source.snippet)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    resultsContainer.innerHTML = resultHtml;
    
    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }
}

// Show follow-up input (global for onclick)
window.showFollowup = function(id) {
    // Hide all other follow-up inputs
    document.querySelectorAll('.followup-input-container').forEach(el => {
        el.classList.remove('active');
    });
    
    const followupContainer = document.getElementById(`followup-${id}`);
    if (followupContainer) {
        followupContainer.classList.add('active');
        const input = document.getElementById(`followup-input-${id}`);
        if (input) {
            input.focus();
        }
    }
}

// Hide follow-up input (global for onclick)
window.hideFollowup = function(id) {
    const followupContainer = document.getElementById(`followup-${id}`);
    if (followupContainer) {
        followupContainer.classList.remove('active');
        const input = document.getElementById(`followup-input-${id}`);
        if (input) {
            input.value = '';
        }
    }
}

// Send follow-up question (global for onclick)
window.sendFollowup = async function(id) {
    const item = searchHistory.find(s => s.id === id);
    if (!item) return;

    const input = document.getElementById(`followup-input-${id}`);
    const followupQuery = input.value.trim();
    
    if (!followupQuery) {
        alert('Please enter a follow-up question');
        return;
    }

    hideFollowup(id);
    
    // Show loading
    resultsContainer.innerHTML = loadingTemplate.innerHTML;
    updateLoadingStep(1);

    let stepInterval = setInterval(() => {
        const currentStep = resultsContainer.querySelector('.loading-step.active');
        if (currentStep) {
            const stepId = currentStep.id;
            const stepNum = parseInt(stepId.replace('step', ''));
            if (stepNum < 4) {
                updateLoadingStep(stepNum + 1);
            }
        }
    }, 2000);

    // Check credits
    if (currentUser && !await deductCredit()) {
        return;
    }
    
    try {
        const response = await fetch('http://127.0.0.1:5000/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                query: followupQuery,
                followup: true,
                previous_context: {
                    query: item.query,
                    summary: item.summary,
                    sources: item.sources
                }
            }),
        });

        clearInterval(stepInterval);
        updateLoadingStep(5);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Save new search to history
        const newSearch = {
            id: Date.now().toString(),
            query: followupQuery,
            summary: data.summary,
            sources: data.sources || [],
            queries_used: data.queries_used || [],
            timestamp: Date.now(),
            is_followup: true,
            parent_id: id
        };
        
        searchHistory.unshift(newSearch);
        // Keep only last 50 searches
        if (searchHistory.length > 50) {
            searchHistory = searchHistory.slice(0, 50);
        }
        saveHistory();
        currentSearchId = newSearch.id;

        // Display result (same as regular search)
        displaySearchResult(data);
        
    } catch (error) {
        if (typeof stepInterval !== 'undefined') {
            clearInterval(stepInterval);
        }
        resultsContainer.innerHTML = `<div class="result" style="color: red; background-color: #fee; padding: 15px; border-radius: 6px;"><strong>Error:</strong> ${error.message}</div>`;
        console.error('Error:', error);
    }
}

// Clear all history
clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all search history?')) {
        searchHistory = [];
        currentSearchId = null;
        saveHistory();
        resultsContainer.innerHTML = '';
    }
});

// Load history on page load
loadHistory();

// Loading animation steps
function updateLoadingStep(stepNumber) {
    // Find steps in results container (or main document if not found)
    const container = resultsContainer.querySelector('.loading-steps') || document.querySelector('.loading-steps');
    if (!container) return;
    
    // Reset all steps
    for (let i = 1; i <= 4; i++) {
        const step = container.querySelector(`#step${i}`);
        if (step) {
            step.classList.remove('active', 'completed');
        }
    }
    
    // Mark previous steps as completed
    for (let i = 1; i < stepNumber; i++) {
        const step = container.querySelector(`#step${i}`);
        if (step) {
            step.classList.add('completed');
        }
    }
    
    // Mark current step as active
    if (stepNumber <= 4) {
        const step = container.querySelector(`#step${stepNumber}`);
        if (step) {
            step.classList.add('active');
        }
    }
}

// Handle follow-up from bottom search bar
followupButton.addEventListener('click', (e) => {
    e.preventDefault();
    const query = followupInput.value.trim();
    if (query) {
        // performSearch will check for login
        performSearch(query, true);
        followupInput.value = '';
    }
});

followupInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = followupInput.value.trim();
        if (query) {
            // performSearch will check for login
            performSearch(query, true);
            followupInput.value = '';
        }
    }
});

// This function is called when the button is clicked
async function performSearch(query = null, isFollowup = false) {
    // Ensure we get the query from input if not provided
    if (!query) {
        query = searchInput ? searchInput.value.trim() : '';
    }
    
    const searchQuery = query;
    if (!searchQuery) {
        alert('Please enter a search query.');
        return;
    }
    
    // Check if user is logged in - require login for searches
    if (!currentUser) {
        // Show login modal
        loginModal.classList.add('active');
        if (typeof switchToLogin === 'function') {
            switchToLogin();
        }
        // Show friendly message
        setTimeout(() => {
            alert('Please login to use the search feature. You can sign up for free and get 10 credits!');
        }, 100);
        return;
    }
    
    // Check credits if logged in
    if (!await deductCredit()) {
        return;
    }
    
    // Clear input
    if (!isFollowup) {
        searchInput.value = '';
    }

    // Add user message to chat
    if (!isFollowup) {
        addUserMessage(searchQuery);
        moveSearchBarDown();
    } else {
        addUserMessage(searchQuery);
    }

    // Show loading animation
    addLoadingMessage();
    
    // Start loading animation sequence
    updateLoadingStep(1);
    
    // Simulate step progression (these will be approximate since we can't track exact backend progress)
    let stepInterval = setInterval(() => {
        const currentStep = resultsContainer.querySelector('.loading-step.active');
        if (currentStep) {
            const stepId = currentStep.id;
            const stepNum = parseInt(stepId.replace('step', ''));
            if (stepNum < 4) {
                updateLoadingStep(stepNum + 1);
            }
        }
    }, 2000); // Update every 2 seconds

    try {
        // Send the request to our Flask backend
        const requestBody = { 
            query: searchQuery 
        };
        
        // Add previous context if this is a follow-up
        if (isFollowup && previousContext) {
            requestBody.followup = true;
            requestBody.previous_context = previousContext;
        }
        
        const response = await fetch('http://127.0.0.1:5000/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        clearInterval(stepInterval);
        
        // Mark all steps as completed
        updateLoadingStep(5);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Remove loading message
        removeLoadingMessage();
        
        // Save search to history
        const searchItem = {
            id: Date.now().toString(),
            query: searchQuery,
            summary: data.summary,
            sources: data.sources || [],
            queries_used: data.queries_used || [],
            timestamp: Date.now(),
            is_followup: isFollowup
        };
        
        searchHistory.unshift(searchItem);
        // Keep only last 50 searches
        if (searchHistory.length > 50) {
            searchHistory = searchHistory.slice(0, 50);
        }
        saveHistory();
        currentSearchId = searchItem.id;
        
        // Store context for follow-ups
        previousContext = {
            query: searchQuery,
            summary: data.summary,
            sources: data.sources || []
        };

        // Display result as assistant message
        addAssistantMessage(data);
        
    } catch (error) {
        if (typeof stepInterval !== 'undefined') {
            clearInterval(stepInterval);
        }
        resultsContainer.innerHTML = `<div class="result" style="color: red; background-color: #fee; padding: 15px; border-radius: 6px;"><strong>Error:</strong> ${error.message}</div>`;
        console.error('Error:', error);
    }
}

// Add user message to chat
function addUserMessage(query) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `<div class="message-bubble">${escapeHtml(query)}</div>`;
    resultsContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add assistant message to chat
function addAssistantMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant';
    
    let sourcesHtml = '';
    if (data.sources && data.sources.length > 0) {
        sourcesHtml = '<div class="sources-section"><h4>Sources:</h4>';
        data.sources.forEach(source => {
            sourcesHtml += `<div class="source-item"><a href="${source.link}" target="_blank">${escapeHtml(source.title || 'Source')}</a></div>`;
        });
        sourcesHtml += '</div>';
    }
    
    let queriesHtml = '';
    if (data.queries_used && data.queries_used.length > 0) {
        queriesHtml = `<div class="queries-section"><strong>Queries:</strong> ${data.queries_used.map(q => `<span class="query-tag">${escapeHtml(q)}</span>`).join('')}</div>`;
    }
    
    let renderedContent = '';
    if (data.summary) {
        if (typeof marked !== 'undefined') {
            renderedContent = marked.parse(data.summary);
        } else {
            renderedContent = data.summary.replace(/\n/g, '<br>');
        }
    } else {
        renderedContent = 'No answer generated.';
    }
    
    messageDiv.innerHTML = `
        <div class="message-bubble">
            ${queriesHtml}
            <div class="result-content">${renderedContent}</div>
            ${sourcesHtml}
        </div>
    `;
    resultsContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add loading message
function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'current-loading';
    loadingDiv.className = 'message message-assistant';
    loadingDiv.innerHTML = loadingTemplate.innerHTML;
    resultsContainer.appendChild(loadingDiv);
    scrollToBottom();
}

// Remove loading message
function removeLoadingMessage() {
    const loading = document.getElementById('current-loading');
    if (loading) {
        loading.remove();
    }
}

// Scroll to bottom
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Function to display search result (for viewing history)
function displaySearchResult(data) {
    // Build sources HTML
        let sourcesHtml = '';
        if (data.sources && data.sources.length > 0) {
            sourcesHtml = '<div class="sources-section"><h3>Sources Used:</h3>';
            data.sources.forEach(source => {
                sourcesHtml += `
                    <div class="source-item">
                        <a href="${source.link}" target="_blank">${source.title || 'Source'}</a>
                        ${source.snippet ? `<div class="source-snippet">${escapeHtml(source.snippet)}</div>` : ''}
                    </div>
                `;
            });
            sourcesHtml += '</div>';
        }

        // Build queries HTML
        let queriesHtml = '';
        if (data.queries_used && data.queries_used.length > 0) {
            queriesHtml = '<div class="queries-section">';
            queriesHtml += '<strong>Search queries used:</strong> ';
            data.queries_used.forEach(query => {
                queriesHtml += `<span class="query-tag">${query}</span>`;
            });
            queriesHtml += '</div>';
        }

        // Render markdown to HTML
        let renderedContent = '';
        if (data.summary) {
            if (typeof marked !== 'undefined') {
                renderedContent = marked.parse(data.summary);
            } else {
                // Fallback if marked.js is not loaded
                renderedContent = data.summary.replace(/\n/g, '<br>');
            }
        } else {
            renderedContent = 'No answer generated.';
        }

        // Build the HTML for the result and add it to the page
        const resultHtml = `
            <div class="result">
            ${queriesHtml}
            <h3>Comprehensive Answer:</h3>
            <div class="result-content">${renderedContent}</div>
            ${sourcesHtml}
            </div>
        `;
        resultsContainer.innerHTML = resultHtml;
}

// Add event listeners
searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
        performSearch(query, false);
    }
});

// Allow pressing 'Enter' to search
searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query, false);
        }
    }
});

