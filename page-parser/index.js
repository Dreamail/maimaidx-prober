import express from "express";
import bodyParser from "body-parser";
import xpath from "xpath";
import xmldom from "xmldom";
import axios from "axios";
import { friendVSPageToRecordList, computeRecord, pageToRecordList } from "./dom_handler.js";
import cookieParser from 'cookie-parser';
const dom = xmldom.DOMParser;

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
  console.log(req.cookies)
  req.cookies['_t'] = req.query._t;
  req.cookies['userId'] = req.query.userId;
  console.log(req.cookies)
  req.headers.cookie = ''
  Object.keys(req.cookies).forEach((cookieName) => {
    const cookieValue = req.cookies[cookieName];
    req.headers.cookie += `${cookieName}=${cookieValue};`;
  });
  console.log(req.headers)
  try {
    // 使用axios发送请求，并将前端发送的header数据添加到请求中
    const response = await axios({
      method: req.method,
      url: url,
      headers: req.headers,
      data: req.body
    });

    // 将请求结果通过Express返回
    res.send(response.data);
    console.log(response.headers)
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
app.all("/maimai-mobile/*", proxy);
app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
