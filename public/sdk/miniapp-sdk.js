var TeviJS = (function (window) {
    var navigator = window.navigator,
        version = '1.0.0',
        userAgent = navigator.userAgent || navigator.vendor || window.opera,
        JSCallFuncCallbacks = {},
        parentOrigin = '*',
        ALLOWED_ORIGIN_PATTERNS = ['.tevi.com', '.tevi.dev'],
        actionMap = {
            LOAD_CONFIG: 'action.app.loadConfig',
            GET_USER_INFO: 'action.user.core.getInfo',
            CHECK_REMAINING_USER: 'action.user.core.checkRemainingUser',
            BUY_ITEM: 'action.user.billy.buyItem',
            TOPUP: 'action.user.billy.topup',
            PURCHASE_STAR: 'action.purchaseStar',
            QUIT_GAME: 'action.quitGame',
            SHOW_BACK_BUTTON: 'action.app.showBackButton',
            SHOW_CLOSE_BUTTON: 'action.app.showCloseButton',
            EXECUTE_LINK: 'action.executeLink',
            SCAN_QR_CODE: 'action.scanQRCode',
            DOWNLOAD_MEDIA: 'action.downloadMedia',
            CREATE_POST: 'action.createPost',
            BACK_BUTTON_CLICKED: 'action.app.backButtonClicked',
            CLOSE_BUTTON_CLICKED: 'action.app.closeButtonClicked',
            SETTING_BUTTON_CLICKED: 'action.app.settingButtonClicked',
            SHARE_BUTTON_CLICKED: 'action.app.shareButtonClicked',
            RELOAD_BUTTON_CLICKED: 'action.app.reloadButtonClicked',
            TERM_BUTTON_CLICKED: 'action.app.termButtonClicked',
            PRIVACY_BUTTON_CLICKED: 'action.app.privacyButtonClicked',
        }

    // Derive parent origin from referrer
    try {
        if (document.referrer) {
            parentOrigin = new URL(document.referrer).origin
        }
    } catch (e) {}

    function isAllowedOrigin(origin) {
        try {
            var hostname = new URL(origin).hostname
            // Allow localhost for development
            if (hostname === 'localhost' || hostname === '127.0.0.1') return true
            // Allow tevi.com and tevi.dev domains
            for (var i = 0; i < ALLOWED_ORIGIN_PATTERNS.length; i++) {
                if (
                    hostname === ALLOWED_ORIGIN_PATTERNS[i].slice(1) ||
                    hostname.endsWith(ALLOWED_ORIGIN_PATTERNS[i])
                ) {
                    return true
                }
            }
        } catch (e) {}
        return false
    }

    function isFunction(value) {
        return typeof value === 'function'
    }

    function isObject(obj) {
        return typeof obj === 'object'
    }

    function isEmpty(str) {
        return !str || 0 === str.trim().length
    }

    function isString(obj) {
        if (typeof obj === 'string') {
            return true
        }
        if (obj === undefined || obj === null) {
            return false
        }
        if (typeof obj !== 'object') {
            return false
        }
        if (!obj.constructor) {
            return false
        }
        return obj.constructor.toString().match(/string/i) !== null
    }

    var device = (function (agent) {
        var _agent = agent.toLowerCase()
        return {
            isWP: /iemobile/.test(_agent),
            isAndroid: /android/i.test(_agent) && !/iemobile/.test(_agent),
            isIOS: /iphone|ipad|ipod/.test(_agent) && !/iemobile/.test(_agent),
            isMobile: /android|iphone|ipad|ipod|iemobile/.test(_agent),
        }
    })(userAgent)

    var browser = (function (userAgent) {
        var b = userAgent.toLowerCase()
        return {
            webkit: /(webkit|khtml)/.test(b),
            opera: /opera/.test(b),
            msie: /msie/.test(b) && !/opera/.test(b),
            mozilla: /mozilla/.test(b) && !/(compatible|webkit)/.test(b),
        }
    })(userAgent)

    function parseJSON(str) {
        var base64Matcher = new RegExp(
            '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$',
        )
        if (isObject(JSON) && JSON.parse && isString(str) && base64Matcher.test(str)) {
            return JSON.parse(atob(str))
        } else if (isObject(JSON) && JSON.parse && isString(str)) {
            return JSON.parse(str)
        } else if (typeof str === 'object') {
            return str
        } else {
            return {}
        }
    }

    function onJSCall(data) {
        console.log('onJSCall', JSON.stringify(data))
        try {
            data = parseJSON(data)
            if (JSCallFuncCallbacks[data.action]) {
                var callback = JSCallFuncCallbacks[data.action]
                callback.call(this, data)
                delete JSCallFuncCallbacks[data.action]
            }
        } catch (e) {
            console.error('TeviJS onJSCall Error', e)
        }
    }

    function defaulCallBackJSCall(data) {
        if (data !== null && data !== undefined) {
            data = parseJSON(data)
        }
    }

    function getUserAgent() {
        try {
            return window.navigator.userAgent
        } catch (e) {}
        return ''
    }

    function serialize(data) {
        if (isObject(JSON) && JSON.stringify) {
            return JSON.stringify(data)
        }
        if (data === undefined) {
            return 'undefined'
        }
        if (data === null) {
            return 'null'
        }
        try {
            if (typeof data === 'string' || data.constructor.toString().match(/string/i) !== null) {
                return '"' + data.replace(/"/g, '\\"') + '"'
            }
        } catch (e) {}
        var a
        if (Object.prototype.toString.call(data).match(/array/i) !== null) {
            a = []
            var length = data.length
            for (var i = 0; i < length; i++) {
                a.push(serialize(data[i]))
            }
            return '[' + a.join(',') + ']'
        }
        if (typeof data === 'object') {
            a = []
            for (var f in data) {
                a.push('"' + f + '":' + serialize(data[f]))
            }
            return '{' + a.join(',') + '}'
        }
        return data.toString()
    }

    window.addEventListener('message', function (event) {
        // Validate origin against allowed Tevi domains
        if (!isAllowedOrigin(event.origin)) return

        // Lock parent origin on first valid message for targeted postMessage
        if (parentOrigin === '*') {
            parentOrigin = event.origin
        }

        // Message received from parent
        if (event?.data) {
            var data = event.data
            try {
                if (typeof data === 'string') data = JSON.parse(data)
            } catch (e) {
                return
            }
            if (data?.eventType) {
                console.log('Message received from the parent: ' + JSON.stringify(data))
                onJSCall({ action: data.eventType, ...data.eventData })
            }
        }
    })

    function jsCall(action, options, callback) {
        console.log('JSCall', action, options, callback)
        JSCallFuncCallbacks[action] = callback

        if (options === undefined || options === null) {
            options = {}
        }

        if (isFunction(options) && callback === undefined) {
            callback = options
            options = {}
        }

        if (!callback) {
            callback = TeviJS.defaultCallback
        }

        var dataCallback = {
            error_code: -14,
            error_message: 'request Timeout!',
            data: {},
            action: action,
        }

        try {
            options = serialize(options)
            console.log('options', options, 'iOS', device.isIOS, 'android', device.isAndroid)
            if (device.isIOS) {
                try {
                    if (webkit?.messageHandlers?.TeviJSInterface)
                        return webkit?.messageHandlers?.TeviJSInterface.postMessage({
                            action,
                            options,
                        })
                } catch (error) {
                    console.log(error)
                }
            }
            if (device.isAndroid) {
                try {
                    if (isObject(TeviJSInterface)) {
                        return TeviJSInterface.jsCall(action, options)
                    }
                } catch (error) {
                    console.log(error)
                }
            }

            // Browser
            console.log('Not mobile')

            if (window.top) {
                window.top.postMessage(
                    { eventType: action, eventData: parseJSON(options) },
                    parentOrigin,
                )
                return
            }

            dataCallback = {
                error_code: -6,
                error_message: 'Not Available Device!',
                data: {
                    userAgent: getUserAgent(),
                    options: options,
                },
                action: action,
            }
            TeviJS.onJSCall(dataCallback)
        } catch (E) {
            console.log('jsCall error', E)
            dataCallback = {
                error_code: -5,
                error_message: 'Not ready!',
                data: {
                    userAgent: getUserAgent(),
                    options: options,
                },
                action: action,
                js_error: E,
            }
            TeviJS.onJSCall(dataCallback)
            return false
        }
    }

    function loadConfig(options, callback) {
        return jsCall(actionMap.LOAD_CONFIG, options, callback)
    }

    function getUserInfo(options, callback) {
        return jsCall(actionMap.GET_USER_INFO, options, callback)
    }

    function checkRemainingUser(options, callback) {
        return jsCall(actionMap.CHECK_REMAINING_USER, options, callback)
    }

    function buyItem(options, callback) {
        return jsCall(actionMap.BUY_ITEM, options, callback)
    }

    function topup(options, callback) {
        return jsCall(actionMap.TOPUP, options, callback)
    }

    function purchaseStar(options, callback) {
        return jsCall(actionMap.PURCHASE_STAR, options, callback)
    }

    function quitGame(options, callback) {
        return jsCall(actionMap.QUIT_GAME, options, callback)
    }

    function showBackButton(options, callback) {
        return jsCall(actionMap.SHOW_BACK_BUTTON, options, callback)
    }

    function showCloseButton(options, callback) {
        return jsCall(actionMap.SHOW_CLOSE_BUTTON, options, callback)
    }

    function executeLink(options, callback) {
        return jsCall(actionMap.EXECUTE_LINK, options, callback)
    }

    function scanQRCode(options, callback) {
        return jsCall(actionMap.SCAN_QR_CODE, options, callback)
    }

    function downloadMedia(options, callback) {
        return jsCall(actionMap.DOWNLOAD_MEDIA, options, callback)
    }

    function createPost(options, callback) {
        return jsCall(actionMap.CREATE_POST, options, callback)
    }

    function backButtonClicked(options, callback) {
        return jsCall(actionMap.BACK_BUTTON_CLICKED, options, callback)
    }

    function closeButtonClicked(options, callback) {
        return jsCall(actionMap.CLOSE_BUTTON_CLICKED, options, callback)
    }

    function settingButtonClicked(options, callback) {
        return jsCall(actionMap.SETTING_BUTTON_CLICKED, options, callback)
    }

    function shareButtonClicked(options, callback) {
        return jsCall(actionMap.SHARE_BUTTON_CLICKED, options, callback)
    }

    function reloadButtonClicked(options, callback) {
        return jsCall(actionMap.RELOAD_BUTTON_CLICKED, options, callback)
    }

    function termButtonClicked(options, callback) {
        return jsCall(actionMap.TERM_BUTTON_CLICKED, options, callback)
    }

    function privacyButtonClicked(options, callback) {
        return jsCall(actionMap.PRIVACY_BUTTON_CLICKED, options, callback)
    }

    return {
        version,
        jsCall,
        browser,
        loadConfig,
        getUserInfo,
        checkRemainingUser,
        buyItem,
        topup,
        purchaseStar,
        quitGame,
        showBackButton,
        showCloseButton,
        executeLink,
        scanQRCode,
        downloadMedia,
        createPost,
        backButtonClicked,
        closeButtonClicked,
        settingButtonClicked,
        shareButtonClicked,
        reloadButtonClicked,
        termButtonClicked,
        privacyButtonClicked,
        onJSCall,
        defaultCallback: defaulCallBackJSCall,
    }
})(window)
