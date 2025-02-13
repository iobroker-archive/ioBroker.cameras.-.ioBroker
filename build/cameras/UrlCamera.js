"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const GenericCamera_1 = __importDefault(require("./GenericCamera"));
const axios_1 = __importDefault(require("axios"));
class UrlCamera extends GenericCamera_1.default {
    config;
    runningRequest = null;
    constructor(adapter, config) {
        super(adapter, config);
        this.config = config;
    }
    async init() {
        // check parameters
        if (!this.config.url ||
            typeof this.config.url !== 'string' ||
            (!this.config.url.startsWith('http://') && !this.config.url.startsWith('https://'))) {
            throw new Error(`Invalid URL: "${this.config.url}"`);
        }
        return super.init();
    }
    async process() {
        if (this.runningRequest) {
            return this.runningRequest;
        }
        this.runningRequest = axios_1.default
            .get(this.config.url, {
            responseType: 'arraybuffer',
            validateStatus: status => status < 400,
            timeout: this.config.timeout,
        })
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
}
exports.default = UrlCamera;
//# sourceMappingURL=UrlCamera.js.map