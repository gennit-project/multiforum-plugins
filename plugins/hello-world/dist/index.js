"use strict";
// Hello World plugin
// A simple channel-scoped plugin that logs when content is created.
Object.defineProperty(exports, "__esModule", { value: true });
class HelloWorld {
    constructor(context) {
        this.context = context;
        this.logger = context.log;
    }
    async handleEvent(event) {
        try {
            this.logger(`Hello from channel ${this.context.channelId}! Event type: ${event.type}`);
            const targetId = event.payload.commentId ?? event.payload.discussionId;
            if (targetId) {
                await this.context.storeFlag({
                    targetId,
                    type: "info",
                    severity: "low",
                    message: `Hello World plugin executed for ${event.type}`,
                });
            }
            return {
                success: true,
                result: {
                    message: `Hello World plugin executed successfully for ${event.type}`,
                    channelId: this.context.channelId,
                    targetId
                }
            };
        }
        catch (error) {
            this.logger('Hello World plugin failed:', error);
            return {
                success: false,
                error: error.message,
                retryable: true
            };
        }
    }
    static validateSecrets(_secrets) {
        // This plugin has no secrets to validate
        return {
            isValid: true,
            errors: []
        };
    }
}
exports.default = HelloWorld;
