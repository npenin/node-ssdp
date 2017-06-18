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
var assert = require("assert");
var extend = require("extend");
var c = require("./const");
var Promise = require("bluebird");
var SsdpServer = (function (_super) {
    __extends(SsdpServer, _super);
    function SsdpServer(opts) {
        return _super.call(this, opts, 'node-ssdp:server') || this;
    }
    /**
     * Binds UDP socket to an interface/port
     * and starts advertising.
     *
     * @param [Function] callback to socket.bind
     * @returns [Promise] promise when socket.bind is ready
     */
    SsdpServer.prototype.start = function (cb) {
        var self = this;
        if (self._socketBound) {
            self._logger('Server already running.');
            return;
        }
        self._socketBound = true;
        if (!self.options.suppressRootDeviceAdvertisements) {
            this._usns[this.options.udn] = this.options.udn;
        }
        return new Promise(function (success, failure) {
            function onBind(err) {
                self._initAdLoop.apply(self, arguments);
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
     * Binds UDP socket
     *
     * @param ipAddress
     * @private
     */
    SsdpServer.prototype._initAdLoop = function () {
        var self = this;
        // Wake up.
        setTimeout(self.advertise.bind(self), 3000);
        self._startAdLoop();
    };
    /**
     * Advertise shutdown and close UDP socket.
     */
    SsdpServer.prototype.stop = function () {
        if (!this._started) {
            this._logger('Already stopped.');
            return;
        }
        this.advertise(false);
        this._stopAdLoop();
        this._stop();
    };
    SsdpServer.prototype._startAdLoop = function () {
        assert.equal(this._adLoopInterval, null, 'Attempting to start a parallel ad loop');
        this._adLoopInterval = setInterval(this.advertise.bind(this), this.options.adInterval);
    };
    SsdpServer.prototype._stopAdLoop = function () {
        assert.notEqual(this._adLoopInterval, null, 'Attempting to clear a non-existing interval');
        clearInterval(this._adLoopInterval);
        this._adLoopInterval = null;
    };
    /**
     *
     * @param alive
     */
    SsdpServer.prototype.advertise = function (alive) {
        var self = this;
        if (!this._started)
            return;
        if (alive === undefined)
            alive = true;
        Object.keys(self._usns).forEach(function (usn) {
            var udn = self._usns[usn], nts = alive ? c.SSDP_ALIVE : c.SSDP_BYE; // notification sub-type
            var heads = {
                'HOST': self._ssdpServerHost,
                'NT': usn,
                'NTS': nts,
                'USN': udn
            };
            if (alive) {
                heads.LOCATION = self._location;
                heads['CACHE-CONTROL'] = 'max-age=' + (Math.round(self.options.adInterval / 1000) + 2);
                heads.SERVER = self.options.ssdpSig; // why not include this?
            }
            extend(heads, self.options.headers);
            self._logger('Sending an advertisement event');
            var message = self._getSSDPHeader(c.NOTIFY, heads);
            self._send(new Buffer(message), function (err, bytes) {
                self._logger('Outgoing server message: %o', { 'message': message });
            });
        });
    };
    return SsdpServer;
}(_1.SSDP));
exports.SsdpServer = SsdpServer;
//# sourceMappingURL=server.js.map