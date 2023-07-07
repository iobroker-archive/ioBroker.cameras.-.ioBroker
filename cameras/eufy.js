const { getRtspSnapshot } = require('./rtsp');
const path = require('path');
const URL = require('url');

async function init(adapter, cam) {
    adapter.__urlCameras = adapter.__urlCameras || {};
    adapter.__urlCameras[cam.name] = true;

    if (cam.useOid && !cam.oid) {
        throw new Error(`Invalid object ID: "${cam.oid}"`);
    }

    // check parameters
    if (!cam.useOid && (!cam.ip || typeof cam.ip !== 'string')) {
        throw new Error(`Invalid IP: "${cam.ip}"`);
    }

    if (cam.cacheTimeout === undefined || cam.cacheTimeout === null || cam.cacheTimeout === '') {
        cam.cacheTimeout = adapter.config.defaultCacheTimeout;
    } else {
        cam.cacheTimeout = parseInt(cam.cacheTimeout, 10) || 0;
    }
    cam.settings = JSON.parse(JSON.stringify(cam));

    if (cam.useOid) {
        const url = await adapter.getForeignStateAsync(cam.oid);
        const parts = cam.oid.split('.');
        parts.pop();
        parts.push('rtsp_stream');
        const rtspEnabled = await adapter.getForeignStateAsync(parts.join('.'));
        if (rtspEnabled && !rtspEnabled.val) {
            await adapter.setForeignStateAsync(parts.join('.'), true);
        }
        if (url && url.val) {
            const u = URL.parse(url.val);
            cam.settings.ip = u.hostname;
            cam.settings.port = u.port;
            cam.settings.urlPath = u.pathname;
            cam.settings.username = u.username;
            cam.settings.decodedPassword = u.password;
        }
    } else {
        cam.settings.port = 80;
        cam.settings.urlPath = '/live0';
    }
}

function unload(adapter, cam) {
    if (adapter.__urlCameras[cam.name]) {
        delete adapter.__urlCameras[cam.name];
    }
    // after last unload all the resources must be cleared too
    if (Object.keys(adapter.__urlCameras)) {
        // unload
    }

    // do nothing
    return Promise.resolve();
}

function process(adapter, cam) {
    if (cam.cache && cam.cacheTime > Date.now()) {
        return Promise.resolve(cam.cache);
    }

    if (cam.runningRequest) {
        return cam.runningRequest;
    }

    adapter.log.debug(`Requesting Eufy from ${cam.ip}...`);

    const outputFileName = path.normalize(`${adapter.config.tempPath}/${cam.ip.replace(/[.:]/g, '_')}.jpg`);

    cam.runningRequest = getRtspSnapshot(adapter.config.ffmpegPath, cam.settings, outputFileName, adapter)
        .then(body => {
            cam.runningRequest = null;
            adapter.log.debug(`Eufy from ${cam.ip}. Done!`);

            const result = {
                body,
                contentType: 'image/jpeg',
            };

            if (cam.cacheTimeout) {
                cam.cache = result;
                cam.cacheTime = Date.now() + cam.cacheTimeout;
            }

            return result;
        });

    return cam.runningRequest;
}

module.exports = {
    init,
    process,
    unload,
};