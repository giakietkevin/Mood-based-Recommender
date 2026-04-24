/**
 * MongoDB Auth Helper - KietStation
 * Handles authentication with FastAPI + MongoDB backend
 */

const AUTH_API_BASE = window.location.origin;

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

function getAuthToken() {
    return localStorage.getItem('kiet_access_token');
}

function getRefreshToken() {
    return localStorage.getItem('kiet_refresh_token');
}

function setAuthTokens(accessToken, refreshToken) {
    localStorage.setItem('kiet_access_token', accessToken);
    localStorage.setItem('kiet_refresh_token', refreshToken);
}

function clearAuthTokens() {
    localStorage.removeItem('kiet_access_token');
    localStorage.removeItem('kiet_refresh_token');
}

// ============================================================
// API CALLS
// ============================================================

async function registerUser(email, password, fullName) {
    const response = await fetch(`${AUTH_API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            password: password,
            full_name: fullName
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Registration failed');
    }

    return await response.json();
}

async function loginUser(email, password) {
    const response = await fetch(`${AUTH_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            password: password
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();

    // Store tokens
    setAuthTokens(data.access_token, data.refresh_token);

    return data;
}

async function logoutUser() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return;

    try {
        const response = await fetch(`${AUTH_API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            console.warn('Logout API failed, clearing tokens anyway');
        }
    } catch (error) {
        console.warn('Logout error:', error);
    } finally {
        clearAuthTokens();
    }
}

async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const response = await fetch(`${AUTH_API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            refresh_token: refreshToken
        })
    });

    if (!response.ok) {
        clearAuthTokens();
        throw new Error('Token refresh failed');
    }

    const data = await response.json();
    localStorage.setItem('kiet_access_token', data.access_token);

    return data.access_token;
}

async function getUserProfile() {
    const response = await fetch(`${AUTH_API_BASE}/auth/profile`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`
        }
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Try to refresh token
            try {
                await refreshAccessToken();
                // Retry with new token
                return await getUserProfile();
            } catch (e) {
                clearAuthTokens();
                throw new Error('Session expired');
            }
        }
        throw new Error('Failed to get profile');
    }

    return await response.json();
}

// ============================================================
// AUTHENTICATED FETCH WRAPPER
// ============================================================

async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();

    if (!token) {
        throw new Error('Not authenticated');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    let response = await fetch(url, { ...options, headers });

    // If 401, try to refresh token and retry
    if (response.status === 401) {
        try {
            await refreshAccessToken();
            headers['Authorization'] = `Bearer ${getAuthToken()}`;
            response = await fetch(url, { ...options, headers });
        } catch (e) {
            clearAuthTokens();
            throw new Error('Session expired, please login again');
        }
    }

    return response;
}

// ============================================================
// EXPORT TO WINDOW
// ============================================================

window.MongoAuth = {
    register: registerUser,
    login: loginUser,
    logout: logoutUser,
    refreshToken: refreshAccessToken,
    getProfile: getUserProfile,
    getToken: getAuthToken,
    getRefreshToken: getRefreshToken,
    clearTokens: clearAuthTokens,
    authenticatedFetch: authenticatedFetch
};
