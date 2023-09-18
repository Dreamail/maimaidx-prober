import express from "express";
import bodyParser from "body-parser";
import xpath from "xpath";
import xmldom from "xmldom";
import axios from "axios";
import { friendVSPageToRecordList, computeRecord, pageToRecordList } from "./dom_handler.js";
import cookieParser from 'cookie-parser';
const dom = xmldom.DOMParser;
import { proxy as httpProxy }from './proxy.js'
import config from "./config.js";

const getLoginedUploader = async (body) => {
  const loginCredentials = body.slice(7, body.indexOf("</login>"));
  let xml = new dom().parseFromString(loginCredentials);
  const u = xml.getElementsByTagName("u")[0].textContent;
  const p = xml.getElementsByTagName("p")[0].textContent;

  const resp = await axios.post(
      "https://www.diving-fish.com/api/maimaidxprober/login",
      {
        username: u,
        password: p,
      }
  );
  const token = resp.headers["set-cookie"][0];
  const cookiePayload = token.slice(0, token.indexOf(";"));

  return async (records) => {
    await axios.post(
        "https://www.diving-fish.com/api/maimaidxprober/player/update_records",
        records,
        {
          headers: {
            cookie: cookiePayload,
          },
        }
    );
  };
};

async function getOpenWxURL(req, res) {
  let a = await axios.get("https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx")
  const url = a.request.protocol + '//' + a.request.host + a.request.path
  res.redirect(url.replace('https%3A%2F%2Ftgk-wcaime.wahlap.com', 'http%3A%2F%2Ftgk-wcaime.wahlap.com'))
}

const serve = (pageParser) => {
  return async (req, res) => {
    // Try parse records
    let records = undefined
    try {
      records = pageParser(req.body);
      for (let record of records) {
        computeRecord(record);
      }
      if (records === undefined) throw new Error("Records is undefined")
    }
    catch (err) {
      console.log(err)
      res.status(400).send({ message: "Failed to parse body" });
      return
    }

    // Get login credentials
    if (req.body.startsWith("<login>")) {
      let upload = null;
      try {
        upload = await getLoginedUploader(req.body);
      } catch (err) {
        console.log(err);
        res.status(401).send({ message: "login failed" });
        return;
      }

      try {
        await upload(records);
      }
      catch (_err) {}
      res.send({ message: "success" });
    } else {
      res.send(records);
    }
  };
};

async function proxy(req, res) {
  const url = `https://maimai.wahlap.com${req.url}`;
  req.headers.host = "maimai.wahlap.com";
  req.cookies['_t'] = req.query._t;
  req.cookies['userId'] = req.query.userId;
  req.headers.cookie = ''
  Object.keys(req.cookies).forEach((cookieName) => {
    const cookieValue = req.cookies[cookieName];
    req.headers.cookie += `${cookieName}=${cookieValue};`;
  });
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Connection: 'keep-alive',
    Cookie: req.headers.cookie.substr(0, req.headers.cookie.length - 1),
    Host: 'maimai.wahlap.com',
    Referer: url,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  }
  try {
    // 使用axios发送请求，并将前端发送的header数据添加到请求中
    const response = await axios({
      method: req.method,
      url: url,
      headers: headers,
      data: req.body
    });

    // 将请求结果通过Express返回
    console.log(response.request._header);
    res.send(response.data);
  } catch (error) {
    // 处理请求错误
    console.error(error);
    res.status(500).send({"message": "error"});
  }
}

const app = express();
app.use(cookieParser());
app.use(bodyParser.text({ limit: "32MB" }));
app.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "content-type");
  res.header("Access-Control-Allow-Methods", "DELETE,PUT,POST,GET,OPTIONS");
  if (req.method.toLowerCase() === "options") res.send(200);
  else next();
});
const port = 8089;

app.post("/page/friendVS", serve(friendVSPageToRecordList));
app.post("/page", serve(pageToRecordList));
app.get("/auth", getOpenWxURL);
app.all("/maimai-mobile/*", proxy);
app.listen(port,() => {
  console.log(`Listening at http://localhost:${port}`);
});

if (config.httpProxy.enable) {
  httpProxy.listen(config.httpProxy.port);
  httpProxy.on("error", (error) => console.log(`Proxy error ${error}`));
  console.log(`Proxy server listen on ${config.httpProxy.port}`);
}
