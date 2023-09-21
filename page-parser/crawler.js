import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from "fs";
import url from "url";

let redirectObjects = {};

class RedirectObject {
    constructor(token, type, config, originURL) {
        this.token = token;
        this.type = type;
        if (this.type !== 'maimai-dx' && this.type !== 'chunithm') {
            throw new Error('Invalid type');
        }
        this.config = config;
        this.uri = url.parse(originURL, true).query.redirect_uri;
    }

    isRedirectOf(newURL) {
        return newURL.startsWith(this.uri);
    }
}

function addObject(obj) {
    redirectObjects[obj.token] = obj;
}

function getObject(newURL) {
    // iterate
    for (let key in redirectObjects) {
        if (redirectObjects[key].isRedirectOf(newURL)) {
            return redirectObjects[key];
        }
    }
}

function deleteObject(obj) {
    delete redirectObjects[obj.token];
}

async function getAxiosInstanceByAuthUrl(url) {
    const cj = new CookieJar();
    const axiosInstance = wrapper(axios.create({ jar: cj }));
    await axiosInstance.get(url, {
        headers: {
            Host: "tgk-wcaime.wahlap.com",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x6307001e)",
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        }
    });

    const test_page = await axiosInstance.get("https://maimai.wahlap.com/maimai-mobile/home/");
    fs.writeFileSync("test.html", test_page.data);
    return axiosInstance;
}

export {
    getAxiosInstanceByAuthUrl,
    addObject,
    getObject,
    deleteObject,
    RedirectObject
}