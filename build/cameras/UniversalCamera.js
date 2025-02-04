"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const GenericRtspCamera_1 = __importDefault(require("./GenericRtspCamera"));
const axios_1 = __importDefault(require("axios"));
class UniversalCamera extends GenericRtspCamera_1.default {
    config;
    basicAuth;
    simpleURL;
    constructor(adapter, config, ffmpegPath) {
        super(adapter, config, ffmpegPath);
        this.config = config;
    }
    async init() {
        this.decodedPassword = this.config.password ? this.adapter.decrypt(this.config.password) : '';
        if (!this.config.model) {
            throw new Error('Model is required');
        }
        if (this.config.urlProtocol === 'http://') {
            // It is URL type
            this.isRtsp = false;
            // Calculate basic authentication. The password was encrypted and must be decrypted
            this.basicAuth = this.config.username
                ? `Basic ${Buffer.from(`${this.config.username}:${this.decodedPassword}`).toString('base64')}`
                : undefined;
            this.simpleURL = `http://${this.config.ip}${!this.config.port || parseInt(this.config.port, 10) === 80 ? '' : `:${this.config.port}`}${this.config.urlPath
                .replace('[CHANNEL]', this.config.channel?.toString() || '0')
                .replace('[USERNAME]', this.config.username || '')
                .replace('[PASSWORD]', this.decodedPassword)}`;
        }
        else {
            this.isRtsp = true;
            this.settings = {
                ip: this.config.ip,
                port: this.config.port || 554,
                urlPath: this.config.urlPath
                    .replace('[CHANNEL]', this.config.channel?.toString() || '0')
                    .replace('[USERNAME]', this.config.username || '')
                    .replace('[PASSWORD]', this.decodedPassword),
                username: this.config.username,
                protocol: 'tcp',
            };
        }
        return super.init();
    }
    async processSimple() {
        if (this.runningRequest) {
            return this.runningRequest;
        }
        const options = {
            responseType: 'arraybuffer',
            validateStatus: status => status < 400,
            timeout: this.config.timeout,
        };
        if (this.basicAuth) {
            options.headers = { Authorization: this.basicAuth };
        }
        this.runningRequest = axios_1.default
            .get(this.simpleURL, options)
            .then(response => {
            this.runningRequest = null;
            return {
                body: response.data,
                contentType: response.headers['Content-type'] || response.headers['content-type'],
            };
        })
            .catch(error => {
            if (error.response) {
                throw new Error(error.response.data || error.response.status);
            }
            else {
                throw new Error(error.code);
            }
        });
        return this.runningRequest;
    }
    async process() {
        if (this.simpleURL) {
            return this.processSimple();
        }
        return super.process();
    }
}
exports.default = UniversalCamera;
//# sourceMappingURL=UniversalCamera.js.map