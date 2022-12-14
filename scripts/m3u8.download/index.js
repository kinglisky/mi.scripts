require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const download = require('download');
const m3u8Parser = require('m3u8-parser');
const { exec } = require('child_process');
const pathToFfmpeg = require('ffmpeg-static');
const open = require('open');

const { M3U8_URL, OUTPUT_DIR, OUTPUT_FORMAT, FFMPEG_PATH } = process.env;

const clearEffect = () => {
    return fs.remove(path.resolve(__dirname, OUTPUT_DIR));
};

const downloadM3u8 = async () => {
    const m3u8OutputPath = path.resolve(__dirname, OUTPUT_DIR, 'index.m3u8');
    await fs.ensureDir(path.resolve(__dirname, OUTPUT_DIR));
    await fs.writeFile(m3u8OutputPath, await download(M3U8_URL));
    return m3u8OutputPath;
};

const parseM3u8 = async (filePath) => {
    const m3u8Content = await fs.readFile(filePath, 'utf-8');
    const parser = new m3u8Parser.Parser();
    parser.push(m3u8Content);
    parser.end();
    await fs.writeFile(
        path.resolve(__dirname, OUTPUT_DIR, 'index.m3u8.json'),
        JSON.stringify(parser.manifest)
    );
    return parser.manifest;
};

const downloadM3u8Segments = async (segments) => {
    const baseURL = path.dirname(M3U8_URL);
    const tasks = segments.map(async (item, index) => {
        const videoSegmentURL = `${baseURL}/${item.uri}`;
        // 有些视频资源的路径中会带有 ?xxx=xxx 的查询参数，需要将其剔除
        const outputFileName = `${index}${path
            .extname(item.uri)
            .replace(/\?.+$/g, '')}`;

        const videoSegmentOutput = path.resolve(
            __dirname,
            OUTPUT_DIR,
            outputFileName
        );
        await fs.writeFile(videoSegmentOutput, await download(videoSegmentURL));
        console.log(`${index}: ${item.uri} download ~`);
    });
    await Promise.all(tasks);
    const fileList = segments.map((_, index) => `file ${index}.ts`);
    const fileListOutput = path.resolve(__dirname, OUTPUT_DIR, 'fileList.text');
    await fs.writeFile(fileListOutput, fileList.join('\n'));
    return fileListOutput;
};

const splicingVideos = async (fileListPath) => {
    const cmd = `${
        FFMPEG_PATH || pathToFfmpeg
    } -f concat -safe 0 -i ${fileListPath}  output.${OUTPUT_FORMAT}`;
    await new Promise((resolve, reject) => {
        console.log(`run : ${cmd}`);
        const task = exec(cmd, (error) => {
            if (error) {
                return reject(error);
            }
            console.log('done~');
            resolve();
        });
        task.stderr.on('data', (data) => console.log(data));
    });
    await open(`output.${OUTPUT_FORMAT}`);
};

(async function () {
    await clearEffect();
    const m3u8OutputPath = await downloadM3u8();
    const m3u8 = await parseM3u8(m3u8OutputPath);
    const fileListPath = await downloadM3u8Segments(m3u8.segments);
    await splicingVideos(fileListPath);
})();
