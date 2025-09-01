"use strict";
// Security: Attachment Scan plugin
// Runs at server scope and scans attachments using the VirusTotal API.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
class SecurityAttachmentScan {
    constructor(context) {
        this.context = context;
        this.logger = context.log;
        // Access server-scoped secrets
        this.virusTotalKey = context.secrets?.server?.VIRUS_TOTAL_API_KEY;
        // Validate configuration
        this.isConfigured = this.validateConfiguration();
        if (!this.isConfigured) {
            this.logger("VIRUS_TOTAL_API_KEY is required but not configured");
        }
    }
    validateConfiguration() {
        const requiredSecrets = ['VIRUS_TOTAL_API_KEY'];
        const missingSecrets = requiredSecrets.filter(key => !this.context.secrets?.server?.[key]);
        if (missingSecrets.length > 0) {
            this.logger(`Missing required secrets: ${missingSecrets.join(', ')}`);
            return false;
        }
        return true;
    }
    async handleEvent(event) {
        // Always check configuration first
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'Plugin not configured - missing required secrets',
                configurationRequired: true,
                missingSecrets: ['VIRUS_TOTAL_API_KEY']
            };
        }
        if (!event.payload.attachmentUrls || event.payload.attachmentUrls.length === 0) {
            this.logger("No attachments to scan");
            return { success: true, result: { message: "No attachments to scan" } };
        }
        try {
            const results = [];
            for (const url of event.payload.attachmentUrls) {
                try {
                    this.logger(`Scanning attachment: ${url}`);
                    // VirusTotal API call
                    const res = await (0, node_fetch_1.default)("https://www.virustotal.com/api/v3/urls", {
                        method: "POST",
                        headers: {
                            "x-apikey": this.virusTotalKey,
                            "content-type": "application/x-www-form-urlencoded",
                        },
                        body: `url=${encodeURIComponent(url)}`,
                    });
                    if (!res.ok) {
                        this.logger(`Failed to scan ${url}: ${res.statusText}`);
                        results.push({ url, error: `Failed to scan: ${res.statusText}` });
                        continue;
                    }
                    const data = await res.json();
                    this.logger(`Scan result for ${url}:`, data);
                    // Store flag for successful scan
                    await this.context.storeFlag({
                        targetId: event.payload.commentId ?? event.payload.discussionId,
                        type: "security",
                        severity: "low",
                        message: `Scanned ${url} successfully with VirusTotal`,
                    });
                    results.push({ url, scanResult: data });
                }
                catch (err) {
                    this.logger(`Error scanning ${url}:`, err.message);
                    results.push({ url, error: err.message });
                }
            }
            return {
                success: true,
                result: {
                    scannedFiles: results.length,
                    results
                }
            };
        }
        catch (error) {
            this.logger('Security attachment scan failed:', error);
            return {
                success: false,
                error: error.message,
                retryable: true
            };
        }
    }
    static validateSecrets(secrets) {
        const errors = [];
        if (secrets.VIRUS_TOTAL_API_KEY) {
            // Basic validation - VirusTotal API keys are typically alphanumeric
            if (secrets.VIRUS_TOTAL_API_KEY.length < 10) {
                errors.push('VIRUS_TOTAL_API_KEY must be at least 10 characters long');
            }
            if (!/^[a-zA-Z0-9]+$/.test(secrets.VIRUS_TOTAL_API_KEY)) {
                errors.push('VIRUS_TOTAL_API_KEY must contain only alphanumeric characters');
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
exports.default = SecurityAttachmentScan;
