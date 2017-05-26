'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/*
 MIT License

 Copyright (c) 2016 Ilya Shaisultanov

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
var _1 = require("./");
var c = require("./const");
var Promise = require("bluebird");
var SsdpClient = (function (_super) {
    __extends(SsdpClient, _super);
    /**
     *
     * @param opts
     * @constructor
     */
    function SsdpClient(opts) {
        return _super.call(this, opts, 'ssdp-client') || this;
    }
    /**
     * Start the listener for multicast notifications from SSDP devices
     * @param [cb]
     */
    SsdpClient.prototype.start = function (cb) {
        var self = this;
        return new Promise(function (success, failure) {
            function onBind(err) {
                if (cb)
                    cb.apply(self, arguments);
                if (err)
                    return failure(err);
                success();
            }
            self._start(onBind);
        });
    };
    /**
     *Close UDP socket.
     */
    SsdpClient.prototype.stop = function () {
        this._stop();
    };
    /**
     *
     * @param {String} serviceType
     * @returns {*}
     */
    SsdpClient.prototype.search = function (serviceType) {
        var self = this;
        if (!this._started) {
            return this.start(function () {
                self.search(serviceType);
            });
        }
        var pkt = self._getSSDPHeader(c.M_SEARCH, {
            'HOST': self._ssdpServerHost,
            'ST': serviceType,
            'MAN': '"ssdp:discover"',
            'MX': 3
        });
        self._logger('Sending an M-SEARCH request');
        var message = new Buffer(pkt);
        self._send(message, function (err, bytes) {
            self._logger('Sent M-SEARCH request: %o', { 'message': pkt });
        });
    };
    return SsdpClient;
}(_1.SSDP));
exports.SsdpClient = SsdpClient;
