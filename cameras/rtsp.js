const spawn = require('child_process').spawn;
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid').v4;

function executeFFmpeg(params, path, adapter) {
    return new Promise((resolve, reject) => {
        if (params && !Array.isArray(params)) {
            params = params.split(' ');
        }

        adapter && adapter.log.debug(`Executing ${path} ${params.join(' ')}`);

        const proc = spawn(path, params || []);
        proc.on('error', err => reject(err));

        const stdout = [];
        const stderr = [];

        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', data => stdout.push(data.toString('utf8')));

        proc.stderr.setEncoding('utf8');
        proc.stderr.on('data', data => stderr.push(data.toString('utf8')));

        proc.on('close', code =>
            code ? reject(stderr.join('')) : resolve(stdout.join('')));
    });
}

function buildCommand(options, outputFileName) {
    const parameters = [
        '-y',
    ];
    let password = options.decodedPassword;
    if (options.username) {
        // convert special characters
        password = encodeURIComponent(password)
            .replace(/!/g, '%21')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\*/g, '%2A');
    }

    options.prefix && parameters.push(options.prefix);
    parameters.push(`-i`);
    parameters.push(`rtsp://${options.username ? `${encodeURIComponent(options.username)}:${password}@` : ''}${options.ip}:${options.port || 554}${options.urlPath ? (options.urlPath.startsWith('/') ? options.urlPath : `/${options.urlPath}`) : ''}`);
    parameters.push('-loglevel');
    parameters.push('error');
    if (options.originalWidth && options.originalHeight) {
        parameters.push(`scale=${options.originalWidth}:${options.originalHeight}`);
    }
    parameters.push('-vframes');
    parameters.push('1');
    options.suffix && parameters.push(options.suffix);
    parameters.push(outputFileName);
    return parameters;
}

function getRtspSnapshot(ffpmegPath, options, outputFileName, adapter) {
    const parameters = buildCommand(options, outputFileName);

    return executeFFmpeg(parameters, ffpmegPath, adapter)
        .then(() => fs.readFileSync(outputFileName));
}

function init(adapter, cam) {
    adapter.__urlCameras = adapter.__urlCameras || {};
    adapter.__urlCameras[cam.name] = true;

    // check parameters
    if (!cam.ip || typeof cam.ip !== 'string') {
        return Promise.reject(`Invalid IP: "${cam.ip}"`);
    }

    cam.decodedPassword = adapter.decrypt(cam.password);
    if (cam.cacheTimeout === undefined || cam.cacheTimeout === null || cam.cacheTimeout === '') {
        cam.cacheTimeout = adapter.config.defaultCacheTimeout;
    } else {
        cam.cacheTimeout = parseInt(cam.cacheTimeout, 10) || 0;
    }

    return Promise.resolve();
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

    adapter.log.debug(`Requesting snapshot from ${cam.ip}...`);

    const outputFileName = path.normalize(`${adapter.config.tempPath}/${cam.ip.replace(/[.:]/g, '_')}.jpg`);
    cam.runningRequest = getRtspSnapshot(adapter.config.ffmpegPath, cam, outputFileName, adapter)
        .then(body => {
            cam.runningRequest = null;
            adapter.log.debug(`Snapshot from ${cam.ip}. Done!`);

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

const streamings = {};

// ffmpeg -rtsp_transport udp -i rtsp://localhost:8090/stream -c:a aac -b:a 160000 -ac 2 -s 854x480 -c:v libx264 -b:v 800000 -hls_time 10 -hls_list_size 2 -hls_flags delete_segments -start_number 1 playlist.m3u8

function webStreaming(adapter, url) {
    if (!streamings[url]) {
        const id = uuidv4();
        const path = `${__dirname}/../data/${id}`;
        fs.mkdirSync(path);
        const proc = spawn(adapter.config.ffmpegPath, 
            `-rtsp_transport udp -i ${url} -c:a aac -b:a 160000 -ac 2 -s 854x480 -c:v libx264 -b:v 800000 -hls_time 10 -hls_list_size 2 -hls_flags delete_segments -start_number 1 ${path}/playlist.m3u8`.split(' ')
        );
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', data => console.log(data.toString('utf8')));

        proc.stderr.setEncoding('utf8');
        proc.stderr.on('data', data => console.error(data.toString('utf8')));
        streamings[url] = {
            url,
            proc,
            id,
        };
    } else {
        clearTimeout(streamings[url].timeout);
    }
    const stopTimeout = () => {
        streamings[url].proc.kill();
        delete streamings[url];
        // fs.rmdirSync(path, { recursive: true });
    };
    streamings[url].timeout = setTimeout(stopTimeout, 10 * 60 * 1000);
    return streamings[url].id;
}

function stopWebStreaming(url) {
    
}

module.exports = {
    init,
    process,
    unload,
    getRtspSnapshot,
    executeFFmpeg,
    webStreaming,
    stopWebStreaming
};