// Azure App Configuration for ToDo Integrator Plugin
// Multi-tenant application registration for public distribution

export const AZURE_APP_CONFIG = {
    // Multi-tenant Azure App Client ID 
    // This is a public client ID that can be safely embedded in the plugin
    CLIENT_ID: 'c6b68d29-5d13-4caf-aba6-14bf3de5c772',
    
    // Tenant ID for personal Microsoft accounts (consumers)
    TENANT_ID: 'consumers',
    
    // Microsoft Graph API scopes required for the plugin
    SCOPES: [
        'https://graph.microsoft.com/Tasks.ReadWrite',
        'https://graph.microsoft.com/User.Read'
    ],
    
    // Authority URL for Microsoft authentication - consumers for personal accounts
    AUTHORITY: 'https://login.microsoftonline.com/consumers'
} as const;

// Alternative configuration for organizational accounts
export const AZURE_ORG_CONFIG = {
    CLIENT_ID: '98e4e49b-7643-44c4-8308-4a19211f23ce',
    TENANT_ID: 'organizations',
    SCOPES: [
        'https://graph.microsoft.com/Tasks.ReadWrite',
        'https://graph.microsoft.com/User.Read'
    ],
    AUTHORITY: 'https://login.microsoftonline.com/organizations'
} as const;

// Development/Testing configuration (can be overridden)
export const DEV_CONFIG = {
    CLIENT_ID: process.env.AZURE_CLIENT_ID || AZURE_APP_CONFIG.CLIENT_ID,
    TENANT_ID: process.env.AZURE_TENANT_ID || AZURE_APP_CONFIG.TENANT_ID
} as const;

// Export the configuration to use based on environment
export const getAzureConfig = () => {
    // Use development config if environment variables are set
    if (process.env.NODE_ENV === 'development' && process.env.AZURE_CLIENT_ID) {
        return {
            ...DEV_CONFIG,
            SCOPES: AZURE_APP_CONFIG.SCOPES,
            AUTHORITY: `https://login.microsoftonline.com/${DEV_CONFIG.TENANT_ID}`
        };
    }
    
    return AZURE_APP_CONFIG;
};

// Helper function to get organizational account config if needed
export const getAzureOrgConfig = () => {
    return AZURE_ORG_CONFIG;
};

// Constants for plugin configuration
export const PLUGIN_CONFIG = {
    DEFAULT_TODO_LIST_NAME: 'Obsidian Tasks',
    DEFAULT_DAILY_NOTES_PATH: 'Daily Notes',
    DEFAULT_SYNC_INTERVAL_MINUTES: 15,
    MIN_SYNC_INTERVAL_MINUTES: 1,
    MAX_SYNC_INTERVAL_MINUTES: 1440, // 24 hours
    DEFAULT_TODO_SECTION_HEADER: 'Tasks',
    SUPPORTED_DATE_FORMATS: [
        'YYYY-MM-DD',
        'DD/MM/YYYY',
        'MM/DD/YYYY',
        'MMM DD, YYYY',
        'DD MMM YYYY',
        'YYYY/MM/DD'
    ]
} as const;