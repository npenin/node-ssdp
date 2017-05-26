'use strict'

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
import { SSDP, SSDPOptions, Headers} from './'
import * as util from 'util'
import * as assert from 'assert'
import * as extend from 'extend'
import * as c from './const'
import * as Promise from 'bluebird'

export class SsdpServer  extends SSDP
{

    constructor(opts:SSDPOptions) {
      super(opts, 'node-ssdp:server');
    }

    private _adLoopInterval:number;
    /**
     * Binds UDP socket to an interface/port
     * and starts advertising.
     *
     * @param [Function] callback to socket.bind
     * @returns [Promise] promise when socket.bind is ready
     */
    public start (cb) {
      var self = this

      if (self._socketBound) {
        self._logger('Server already running.')
        return
      }

      self._socketBound = true

      if (!self.options.suppressRootDeviceAdvertisements) {
        this._usns[this.options.udn] = this.options.udn
      }

      return new Promise(function(success, failure) { 
        function onBind(err) {
          self._initAdLoop.apply(self, arguments)
          if (cb) cb.apply(self, arguments)
          if (err) return failure(err)
          success()
        }
        self._start(onBind)
      })
    }


    /**
     * Binds UDP socket
     *
     * @param ipAddress
     * @private
     */
    private _initAdLoop () {
      var self = this

      // Wake up.
      setTimeout(self.advertise.bind(self), 3000)

      self._startAdLoop()
    }




    /**
     * Advertise shutdown and close UDP socket.
     */
    public stop () {
      if (!this._started) {
        this._logger('Already stopped.')
        return
      }

      this.advertise(false)

      this._stopAdLoop()

      this._stop()
    }



    private _startAdLoop  () {
      assert.equal(this._adLoopInterval, null, 'Attempting to start a parallel ad loop')

      this._adLoopInterval = setInterval(this.advertise.bind(this), this.options.adInterval)
    }



    private _stopAdLoop () {
      assert.notEqual(this._adLoopInterval, null, 'Attempting to clear a non-existing interval')

      clearInterval(this._adLoopInterval)
      this._adLoopInterval = null
    }



    /**
     *
     * @param alive
     */
    public advertise (alive) {
      var self = this

      if (!this._started) return
      if (alive === undefined) alive = true

      Object.keys(self._usns).forEach(function (usn) {
        var udn = self._usns[usn]
          , nts = alive ? c.SSDP_ALIVE : c.SSDP_BYE // notification sub-type

        var heads:Headers = {
          'HOST': self._ssdpServerHost,
          'NT': usn, // notification type, in this case same as ST
          'NTS': nts,
          'USN': udn
        }

        if (alive) {
          heads.LOCATION = self._location
          heads['CACHE-CONTROL'] = 'max-age='+(Math.round(self.options.adInterval/1000)+2)
          heads.SERVER = self.options.ssdpSig // why not include this?
        }

        extend(heads, self.options.headers);

        self._logger('Sending an advertisement event')

        var message = self._getSSDPHeader(c.NOTIFY, heads)

        self._send(new Buffer(message), function (err, bytes) {
          self._logger('Outgoing server message: %o', {'message': message})
        })
      })
    }
}
