import { spawn } from "child_process";
import { existsSync, mkdir } from "fs";
import { dirname } from "path";

enum Converter {
    Sips,
    Imagemagick,
}

function exists(name: string): Promise<boolean> {
    return new Promise((resolve) => {
        const process = spawn("type", [name], {
            stdio: "ignore",
        });

        process.on("exit", (code) => {
            resolve(code === 0);
        });
    });
}

async function determine(): Promise<Converter | null> {
    if (await exists("sips")) {
        return Converter.Sips;
    }
    if (await exists("convert")) {
        return Converter.Imagemagick;
    }
    console.error("No HEIC converter found, attachments will not be converted!");
    return null;
}

function createDir(folder: string): Promise<void> {
    return new Promise((resolve, reject) => {
        mkdir(folder, { recursive: true }, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function heicToJpeg(from: string, to: string, converter: Converter): Promise<void> {
    const folder = dirname(to);

    if (!existsSync(folder)) {
        try {
            await createDir(folder);
        } catch (why) {
            console.error(`Unable to create ${folder}: ${why}`);
            return;
        }
    }

    switch (converter) {
        case Converter.Sips:
            await new Promise<void>((resolve, reject) => {
                const sips = spawn(
                    "sips",
                    ["-s", "format", "jpeg", from, "-o", to],
                    { stdio: "ignore" }
                );

                sips.on("exit", (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        console.error("Conversion failed");
                        reject();
                    }
                });
            });
            break;
        case Converter.Imagemagick:
            await new Promise<void>((resolve, reject) => {
                const convert = spawn(
                    "convert",
                    [from, to],
                    { stdio: "ignore" }
                );

                convert.on("exit", (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        console.error("Conversion failed");
                        reject();
                    }
                });
            });
            break;
    }
}

// Test functions
async function testExists() {
    if (!(await exists("ls"))) {
        console.log("can_find_program test failed");
    }
    if (await exists("fake_name")) {
        console.log("can_miss_program test failed");
    }
}

testExists();