/*
京东价格保护：脚本更新地址 https://raw.githubusercontent.com/ZCY01/daily_scripts/main/jd/jd_priceProtect.js
脚本兼容: QuantumultX, Node.js

==========================Quantumultx=========================
[task_local]
# 京东价格保护
5 0 * * * https://raw.githubusercontent.com/ZCY01/daily_scripts/main/jd/jd_priceProtect.js, tag=京东价格保护, img-url=https://raw.githubusercontent.com/ZCY01/img/master/price.png, enabled=true
*/
const $ = new Env('京东价格保护');
//Node.js用户请在jdCookie.js处填写京东ck;
const jdCookieNode = $.isNode() ? require('./jdCookie.js') : '';
const notify = $.isNode() ? require('./sendNotify') : '';

const selfdomain = 'https://msitepp-fm.jd.com/';
const unifiedGatewayName = 'https://api.m.jd.com/';

//IOS等用户直接用NobyDa的jd cookie
let cookiesArr = [],
	cookie = '';
if ($.isNode()) {
	Object.keys(jdCookieNode).forEach((item) => {
		cookiesArr.push(jdCookieNode[item])
	})
	if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {};
} else {
	cookiesArr.push($.getdata('CookieJD'));
	cookiesArr.push($.getdata('CookieJD2'));
}
const jdNotify = $.getdata('jdPriceProtectNotify'); //是否关闭通知，false打开通知推送，true关闭通知推送

!(async () => {
	if (!cookiesArr[0]) {
		$.msg('价格保护运行失败', '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/', {
			"open-url": "https://bean.m.jd.com/"
		});
	}
	for (let i = 0; i < cookiesArr.length; i++) {
		if (cookiesArr[i]) {
			cookie = cookiesArr[i];
			$.UserName = decodeURIComponent(cookie.match(/pt_pin=(.+?);/) && cookie.match(/pt_pin=(.+?);/)[1])
			$.index = i + 1;
			$.isLogin = true;
			$.nickName = '';
			await TotalBean();
			console.log(`\n开始【京东账号${$.index}】${$.nickName || $.UserName}\n`);
			if (!$.isLogin) {
				$.msg($.name, `【提示】cookie已失效`, `京东账号${$.index} ${$.nickName || $.UserName}\n请重新登录获取\nhttps://bean.m.jd.com/`, {
					"open-url": "https://bean.m.jd.com/"
				});

				if ($.isNode()) {
					await notify.sendNotify(`${$.name}cookie已失效 - ${$.UserName}`, `京东账号${$.index} ${$.UserName}\n请重新登录获取cookie`);
				} else {
					$.setdata('', `CookieJD${i ? i + 1 : "" }`); //cookie失效，故清空cookie。$.setdata('', `CookieJD${i ? i + 1 : "" }`);//cookie失效，故清空cookie。
				}
				continue
			}

			$.hasNext = true
			$.refundtotalamount = 0
			$.orderList = new Array()
			$.applyMap = {}

			console.log(`💥 获得首页面，解析超参数`)
			await getHyperParams()
			console.log($.HyperParam)

			console.log(`💥 获取所有价格保护列表，排除附件商品`)
			for (let page = 1; $.hasNext; page++) {
				await getApplyData(page)
			}

			console.log(`💥 删除超时的订单`)
			let taskList = []
			for (let order of $.orderList) {
				taskList.push(HistoryResultQuery(order))
			}
			await Promise.all(taskList)

			console.log(`💥 ${$.orderList.length}个商品即将申请价格保护！`)
			for (let order of $.orderList) {
				await skuApply(order)
				await $.wait(200)
			}

			for (let i = 1; i <= 30 && Object.keys($.applyMap).length > 0; i++) {
				console.log(`⏳ 获取申请价格保护结果，${30-i}s...`)
				await $.wait(1000)
				if (i % 5 == 0) {
					await getApplyResult()
				}
			}

			showMsg()
		}
	}
})()
.catch((e) => $.logErr(e))
	.finally(() => $.done())

const getValueById = function (text, id) {
	const reg = new RegExp(`id="${id}".*value="(.*?)"`)
	const res = text.match(reg)
	return res[1]
}

function getHyperParams() {
	return new Promise(async (resolve, reject) => {
		const options = {
			"url": 'https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu',
			"headers": {
				'Host': 'msitepp-fm.jd.com',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Connection': 'keep-alive',
				'Cookie': cookie,
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
				'Accept-Language': 'zh-cn',
				'Referer': 'https://ihelp.jd.com/',
				'Accept-Encoding': 'gzip, deflate, br',
			},
		}
		$.get(options, (err, resp, data) => {
			try {
				if (err) {
					reject(`💩 超级参数获取失败！${JSON.stringify(err)}`)
				} else if (data) {
					$.HyperParam = {
						sid_hid: getValueById(data, 'sid_hid'),
						type_hid: getValueById(data, 'type_hid'),
						isLoadLastPropriceRecord: getValueById(data, 'isLoadLastPropriceRecord'),
						isLoadSkuPrice: getValueById(data, 'isLoadSkuPrice'),
						RefundType_Orderid_Repeater_hid: getValueById(data, 'RefundType_Orderid_Repeater_hid'),
						isAlertSuccessTip: getValueById(data, 'isAlertSuccessTip'),
						forcebot: getValueById(data, 'forcebot'),
						useColorApi: getValueById(data, 'useColorApi'),
						pinType: getValueById(data, 'pinType'),
						keyWords: getValueById(data, 'keyWords'),
						pin: undefined
					}
					let pinreg = data.match(`id="pin".*value="(.*?)"`)
					if (pinreg) $.HyperParam.pin = pinreg[1]
				}
			} catch (e) {
				reject(`💩 超级惨解析失败：${e}`)
			} finally {
				resolve();
			}
		})
	})
}

function getApplyData(page) {
	return new Promise(async (resolve, reject) => {

		$.hasNext = false
		const pageSize = 5
		let paramObj = {};
		paramObj.page = page
		paramObj.pageSize = pageSize
		paramObj.keyWords = $.HyperParam.keyWords
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.forcebot = $.HyperParam.forcebot

		if ($.HyperParam.useColorApi == "true") {
			urlStr = unifiedGatewayName + "api?appid=siteppM&functionId=siteppM_priceskusPull&forcebot=" + $.HyperParam.forcebot + "&t=" + new Date().getTime();
		} else {
			urlStr = selfdomain + "rest/priceprophone/priceskusPull";
		}
		const options = request_option(urlStr, paramObj)
		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 获取价格保护列表: ${JSON.stringify(err)}`)
				} else if (data) {
					let pageErrorVal = data.match(/id="pageError_\d+" name="pageError_\d+" value="(.*?)"/)[1]
					if (pageErrorVal == 'noexception') {
						let pageDatasSize = eval(data.match(/id="pageSize_\d+" name="pageSize_\d+" value="(.*?)"/)[1])
						$.hasNext = pageDatasSize >= pageSize

						let orders = [...data.matchAll(/skuApply\((.*?)\)/g)]
						let titles = [...data.matchAll(/<p class="name">(.*?)<\/p>/g)]
						for (let i = 0; i < orders.length; i++) {
							let info = orders[i][1].split(',')
							if (info.length != 4) {
								reject(`🚫 价格保护 ${order[1]} err`)
								continue
							}

							const item = {
								orderId: eval(info[0]),
								skuId: eval(info[1]),
								sequence: eval(info[2]),
								orderCategory: eval(info[3]),

								title: `🛒${titles[i][1].substr(0,15)}🛒`,
							}

							let id = `skuprice_${item.orderId}_${item.skuId}_${item.sequence}`
							let reg = new RegExp(`${id}.*?isfujian="(.*?)"`)
							isfujian = data.match(reg)[1]

							if (isfujian == "false") {
								let skuRefundTypeDiv_orderId = `skuRefundTypeDiv_${item.orderId}`
								item['refundtype'] = getValueById(data, skuRefundTypeDiv_orderId)
								$.orderList.push(item)
							}
							//else...尊敬的顾客您好，您选择的商品本身为赠品，是不支持价保的呦，请您理解。
						}
					}
				}
			} catch (e) {
				reject(`💩列表解析失败：${e}`)
			} finally {
				resolve();
			}
		})
	})
}

//  申请按钮
// function skuApply(orderId, skuId, sequence, orderCategory, refundtype) {
function skuApply(order) {
	return new Promise(async (resolve, reject) => {
		let paramObj = {};
		paramObj.orderId = order.orderId;
		paramObj.orderCategory = order.orderCategory;
		paramObj.skuId = order.skuId;
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.refundtype = order.refundtype
		paramObj.forcebot = $.HyperParam.forcebot
		paramObj.pinType = $.HyperParam.pinType

		var urlStr = null;
		if ($.HyperParam.useColorApi == "true") {
			urlStr = unifiedGatewayName + "api?appid=siteppM&functionId=siteppM_proApply&forcebot=" + $.HyperParam.forcebot + "&t=" + new Date().getTime();
		} else {
			urlStr = selfdomain + "rest/priceprophone/skuProtectApply";
		}

		console.log(`🚀 ${order.title} 正在价格保护...`)
		const options = request_option(urlStr, paramObj)
		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${order.title} 价格保护 API请求失败，${JSON.stringify(err)}`)
				} else if (data) {
					data = JSON.parse(data)
					if (data.flag) {
						if (data.proSkuApplyId != null) {
							$.applyMap[data.proSkuApplyId[0]] = order
						}
					} else {
						console.log(`🚫 ${order.title} 申请失败：${data.errorMessage}`)
					}
				}
			} catch (e) {
				reject(`💩 ${order.title} 价格保护出错 ${e}`)
			} finally {
				resolve();
			}
		})
	})
}

function HistoryResultQuery(order) {
	return new Promise(async (resolve, reject) => {
		let paramObj = {};
		paramObj.orderId = order.orderId;
		paramObj.skuId = order.skuId;
		paramObj.sequence = order.sequence;
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.pin = $.HyperParam.pin
		paramObj.forcebot = $.HyperParam.forcebot
		paramObj.pinType = $.HyperParam.pinType
		let urlStr = null;
		if ($.HyperParam.useColorApi == "true") {
			urlStr = unifiedGatewayName + "api?appid=siteppM&functionId=siteppM_skuProResultPin&forcebot=" + $.HyperParam.forcebot + "&t=" + new Date().getTime();
		} else {
			urlStr = selfdomain + "rest/priceprophone/skuProResultPin";
		}
		const options = request_option(urlStr, paramObj)
		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					reject(`🚫 ${order.title} 历史查询失败，请检查网路重试`)
				} else if (data) {
					if (data.indexOf('overTime') != -1) {
						$.orderList = $.orderList.filter(item => {
							return item.orderId != order.orderId || item.skuId != order.skuId
						})
					}
				}
			} catch (e) {
				reject(`💩 ${order.title} 历史查询失败：${e}`)
			} finally {
				resolve();
			}
		})
	})
}

function getApplyResult() {
	function handleApplyResult(ajaxResultObj) {
		if (ajaxResultObj.hasResult != "undefined" && ajaxResultObj.hasResult == true) { //有结果了
			let proSkuApplyId = ajaxResultObj.applyResultVo.proSkuApplyId; //申请id
			let order = $.applyMap[proSkuApplyId]
			delete $.applyMap[proSkuApplyId]
			if (ajaxResultObj.applyResultVo.proApplyStatus == 'ApplySuccess') { //价保成功
				$.refundtotalamount += ajaxResultObj.applyResultVo.refundtotalamount
			} else {
				console.log(`💢 ${order.title} 申请失败：${ajaxResultObj.applyResultVo.failTypeStr} 失败类型:${ajaxResultObj.applyResultVo.failType}`)
			}
		}
	}
	return new Promise(async (resolve, reject) => {
		let proSkuApplyIds = Object.keys($.applyMap).join(",");
		let urlStr = null;
		let paramObj = {};
		paramObj.proSkuApplyIds = proSkuApplyIds;
		paramObj.pin = $.HyperParam.pin
		paramObj.type = $.HyperParam.type_hid
		if ($.HyperParam.useColorApi == "true") {
			urlStr = unifiedGatewayName + "api?appid=siteppM&functionId=siteppM_moreApplyResult&forcebot=" + $.HyperParam.forcebot + "&t=" + new Date().getTime();
		} else {
			urlStr = selfdomain + "rest/priceprophone/moreApplyResult";
		}
		const options = request_option(urlStr, paramObj)

		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${$.name} 获得查结果 ${JSON.stringify(err)}`)
				} else if (data) {
					data = JSON.parse(data)
					let resultArray = data.applyResults;
					for (let i = 0; i < resultArray.length; i++) {
						let ajaxResultObj = resultArray[i];
						handleApplyResult(ajaxResultObj);
					}
				}
			} catch (e) {
				reject(`🚫 获得价格保护结果出错！`)
			} finally {
				resolve()
			}
		})
	})
}

function request_option(url, body) {
	const options = {
		"url": url,
		"headers": {
			'Host': $.HyperParam.useColorApi == 'true' ? 'api.m.jd.com' : 'msitepp-fm.jd.com',
			'Accept': '*/*',
			'Accept-Language': 'zh-cn',
			'Accept-Encoding': 'gzip, deflate, br',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Origin': 'https://msitepp-fm.jd.com',
			'Connection': 'keep-alive',
			'Referer': 'https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu',
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
			"Cookie": cookie
		},
		"body": body ? `body=${JSON.stringify(body)}` : undefined
	}
	return options
}


function TotalBean() {
	return new Promise(async resolve => {
		const options = {
			"url": `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
			"headers": {
				"Accept": "application/json,text/plain, */*",
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept-Encoding": "gzip, deflate, br",
				"Accept-Language": "zh-cn",
				"Connection": "keep-alive",
				"Cookie": cookie,
				"Referer": "https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2",
				"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
			}
		}
		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					console.log(`${JSON.stringify(err)}`)
					console.log(`${$.name} API请求失败，请检查网路重试`)
				} else {
					if (data) {
						data = JSON.parse(data);
						if (data['retcode'] === 13) {
							$.isLogin = false; //cookie过期
							return
						}
						$.nickName = data['base'].nickname;
					} else {
						console.log(`京东服务器返回空数据`)
					}
				}
			} catch (e) {
				$.logErr(e, resp)
			} finally {
				resolve();
			}
		})
	})
}

function showMsg() {
	console.log(`🎉 本次价格保护金额：${$.refundtotalamount}💰`)
	// $.msg($.name, `价格保护成功`, `京东账号${$.index} ${$.nickName || $.UserName}\n🎉 本次价格保护金额：${$.refundtotalamount}💰`, {"open-url": "https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu"});
	if ($.refundtotalamount) {
		$.msg($.name, ``, `京东账号${$.index} ${$.nickName || $.UserName}\n🎉 本次价格保护金额：${$.refundtotalamount}💰`, {
			"open-url": "https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu"
		});
	}
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,o)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),h=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)}):this.isQuanX()?$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:o,body:r}=t;e(null,{status:s,statusCode:i,headers:o,body:r},r)},t=>e(t)):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:o,body:r}=t;e(null,{status:s,statusCode:i,headers:o,body:r},r)},t=>e(t)))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:o,body:r}=t;e(null,{status:s,statusCode:i,headers:o,body:r},r)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:o,body:r}=t;e(null,{status:s,statusCode:i,headers:o,body:r},r)},t=>e(t))}}time(t){let e={"M+":(new Date).getMonth()+1,"d+":(new Date).getDate(),"H+":(new Date).getHours(),"m+":(new Date).getMinutes(),"s+":(new Date).getSeconds(),"q+":Math.floor(((new Date).getMonth()+3)/3),S:(new Date).getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,((new Date).getFullYear()+"").substr(4-RegExp.$1.length)));for(let s in e)new RegExp("("+s+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?e[s]:("00"+e[s]).substr((""+e[s]).length)));return t}msg(e=t,s="",i="",o){const r=t=>{if(!t||!this.isLoon()&&this.isSurge())return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}}};this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,r(o)):this.isQuanX()&&$notify(e,s,i,r(o)));let h=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];h.push(e),s&&h.push(s),i&&h.push(i),console.log(h.join("\n")),this.logs=this.logs.concat(h)}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}