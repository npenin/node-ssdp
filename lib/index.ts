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
import * as dgram from 'dgram';
import { EventEmitter as EE } from 'events';
import * as util from 'util';
import * as net from 'net'
import * as os from 'os';
import * as debug from 'debug';
import * as async from 'async';
import * as extend from 'extend';
import * as c from './const'
var httpHeader = /HTTP\/\d{1}\.\d{1} \d+ .*/
  , ssdpHeader = /^([^:]+):\s*(.*)$/

/* consts */

var nodeVersion = process.version.substr(1)
  , moduleVersion = require('../package.json').version
  , moduleName = require('../package.json').name

export type Headers = {
  MX?: number,
  NTS?: string,
  HOST?: string
  MAN?: string;
  ST?: string;
  NT?: string;
  USN?: string;
  LOCATION?: string;
  SERVER?: string;
};

export interface SSDPOptions
{
  ssdpSig?: string;
  ssdpIp?: string;
  ssdpPort?: string;
  ssdpTtl?: number;
  adInterval?: number;
  description?: string;
  udn?: string;
  headers?: Headers;
  ttl?: number;
  allowWildcards?: boolean;
  customLogger?: SSDPLogger;
  explicitSocketBind?: boolean;
  reuseAddr?: boolean;
  location?: string | (() => string);
  suppressRootDeviceAdvertisements?: boolean
  sourcePort?: number;
}

export type SSDPLogger = (message: string, ...args: any[]) => void;

/**
 * Options:
 *
 * @param {Object} opts
 * @param {String} opts.ssdpSig SSDP signature
 * @param {String} opts.ssdpIp SSDP multicast group
 * @param {String} opts.ssdpPort SSDP port
 * @param {Number} opts.ssdpTtl Multicast TTL
 * @param {Number} opts.adInterval Interval at which to send out advertisement (ms)
 * @param {String} opts.description Path to SSDP description file
 * @param {String} opts.udn SSDP Unique Device Name
 * @param {Object} opts.headers Additional headers
 *
 * @param {Number} opts.ttl Packet TTL
 * @param {Boolean} opts.allowWildcards Allow wildcards in M-SEARCH packets (non-standard)
 *
 * @returns {SSDP}
 * @constructor
 */
export class SSDP extends EE
{
  constructor(opts?: SSDPOptions, protected _subclass: string = 'ssdp-base')
  {
    super();
    if (!(this instanceof SSDP))
      return new SSDP(opts, _subclass)

    this.options = extend({
      ssdpSig: getSsdpSignature(),
      reuseAddr: true,
      ssdpPort: c.SSDP_DEFAULT_PORT,
      ssdpTtl: 4,
      sourcePort: 0,
      adInterval: 10000,
      ttl: 1800,
      udn: 'uuid:f40c2981-7329-40b7-8b04-27f187aecfb5',
      headers: {},
    }, opts);

    this._init(this.options)


    this._createSockets()
    this._logger('sockets created')

  }

  protected options: SSDPOptions;

  protected _logger: SSDPLogger;
  private _reuseAddr: boolean = true;
  protected _location: string;
  protected get _ssdpServerHost() { return this.options.ssdpIp + ':' + this.options.ssdpPort }
  protected _usns = {}

  private sockets: { [ip: string]: dgram.Socket } = {};
  protected _socketBound = false;
  protected _started = false;

  /**
   * Initializes instance properties.
   * @param opts
   * @private
   */
  private _init(opts: SSDPOptions)
  {
    this._logger = opts.customLogger || debug(this._subclass)

    if (typeof opts.location === 'function')
    {
      Object.defineProperty(this, '_location', {
        enumerable: true,
        get: opts.location
      })
    } else
    {
      // Probably should specify these
      this._location = opts.location;
    }

  }

  /**
   * Creates and returns UDP4 socket.
   * Prior to node v0.12.x `dgram.createSocket` did not accept
   * an object and socket reuse was not available; this method
   * contains a crappy workaround to make version of node before 0.12
   * to work correctly. See https://github.com/diversario/node-ssdp/pull/38
   *
   * @returns {Socket}
   * @private
   */
  private _createSockets()
  {
    var interfaces = os.networkInterfaces()
      , self = this

    Object.keys(interfaces).forEach(function (iName)
    {
      self._logger('discovering all IPs from interface %s', iName)

      interfaces[iName].forEach(function (ipInfo)
      {
        if (!ipInfo.internal)
        {
          self._logger(<any>ipInfo);
          self._logger('Will use interface %s', iName)
          var socket: dgram.Socket;
          if (ipInfo.family == 'IPv4')
            socket = dgram.createSocket({ type: <any>ipInfo.family.replace('IPv', 'udp'), reuseAddr: self._reuseAddr })

          if (socket)
          {
            self._logger('unreferencing socket');
            socket.unref()
            self._logger(ipInfo.address);
            self.sockets[ipInfo.address] = socket
          }
        }
      })
    })
  }


  /**
   * Advertise shutdown and close UDP socket.
   */
  protected _stop()
  {
    var self = this

    if (!this.sockets)
    {
      this._logger('Already stopped.')
      return
    }

    Object.keys(this.sockets).forEach(function (ipAddress)
    {
      var socket = self.sockets[ipAddress]

      socket && socket.close()

      self._logger('Stopped socket on %s', ipAddress)
    })

    this.sockets = null

    this._socketBound = this._started = false
  }


  /**
   * Configures UDP socket `socket`.
   * Binds event listeners.
   */
  protected _start(cb)
  {
    var self = this

    if (self._started)
    {
      self._logger('Already started.')
      return
    }

    self._logger('starting');

    if (!this.sockets)
    {
      this._createSockets()
      self._logger('sockets created')
    }

    self._started = true

    var interfaces = Object.keys(this.sockets)

    async.each(interfaces, function (iface: string, next)
    {
      var socket = self.sockets[iface];
      self._logger('binding events on ' + iface);
      socket.on('error', function onSocketError(err)
      {
        self._logger('Socker error: %s', err.message)
      })

      socket.on('message', function onSocketMessage(msg, rinfo)
      {
        self._logger('message %s', msg)
        self._parseMessage(msg, rinfo)
      })

      socket.on('listening', function onSocketListening()
      {
        var addr = socket.address()

        self._logger('SSDP listening: %o', { address: 'http://' + addr.address + ':' + addr.port, 'interface': iface })

        try
        {

          if (self.options.ssdpIp)
            socket.addMembership(self.options.ssdpIp, iface) // TODO: specifying the interface in there might make a difference
          else if (net.isIPv4(iface))
          {
            self._logger('adding membership to ssdp ipv4 (%s)', iface);
            socket.addMembership(c.SSDP_DEFAULT_IP4, iface) // TODO: specifying the interface in there might make a difference
          }
          else if (net.isIPv6(iface))
          {

            switch (socket.address()['scopeid'])
            {
              case 1: //Interface-local scope spans only a single interface on a node, and is useful only for loopback transmission of multicast.

              case 2: //Link-local and site-local multicast scopes span the same topological regions as the corresponding unicast scopes.
                socket.addMembership(c.SSDP_DEFAULT_IP6_LINK, iface) // TODO: specifying the interface in there might make a difference
                break;
              case 3: //Realm-local multicast scope is originally defined in RFC 7346, larger than link-local, automatically determined by topology and must not be larger than the following scopes.
              case 4: //Admin-local scope is the smallest scope that must be administratively configured, i.e., not automatically derived from physical connectivity or other, non- multicast-related configuration.
                socket.addMembership(c.SSDP_DEFAULT_IP6_NODE, iface) // TODO: specifying the interface in there might make a difference
                break;
              case 5: //Link-local and site-local multicast scopes span the same topological regions as the corresponding unicast scopes.
                socket.addMembership(c.SSDP_DEFAULT_IP6_SITE, iface) // TODO: specifying the interface in there might make a difference
                break;
              case 8: //Organization-local scope is intended to span multiple sites belonging to a single organization.
                socket.addMembership(c.SSDP_DEFAULT_IP6_ORG, iface) // TODO: specifying the interface in there might make a difference
                break;
              case 0xe: //global
                socket.addMembership(c.SSDP_DEFAULT_IP6_GLOBAL, iface) // TODO: specifying the interface in there might make a difference
                break;
              default:
                self._logger('%o', socket.address());
            }
          }
          else
          {
            self._logger(iface + ' could not be identified as IPv4 nor as IPv6');
            return;
          }

          socket.setMulticastTTL(self.options.ssdpTtl)
        } catch (e)
        {
          self._logger(e);
          if (e.code === 'ENODEV' || e.code === 'EADDRNOTAVAIL')
          {
            self._logger('Interface %s is not present to add multicast group membership. Scheduling a retry. Error: %s', addr, e.message)
            setTimeout(onSocketListening, 5000)
          } else
          {
            throw e
          }
        }
      })

      try
      {
        self._logger('binding socket ' + iface)
        if (self.options.explicitSocketBind)
        {
          socket.bind({ port: self.options.sourcePort, address: iface, exclusive: true }, next)
        } else
        {
          socket.bind({ port: self.options.sourcePort, exclusive: true }, next) // socket binds on 0.0.0.0
        }
        self._logger('bound socket ' + iface)
      }
      catch (e)
      {
        self._logger(e);
        delete self.sockets[iface];
      }
    }, cb)
  }



  /**
   * Routes a network message to the appropriate handler.
   *
   * @param msg
   * @param rinfo
   */
  protected _parseMessage(msg: Buffer, rinfo: dgram.RemoteInfo)
  {
    var message = msg.toString()

    var type = message.substring(0, message.indexOf('\n'));

    // HTTP/#.# ### Response to M-SEARCH
    if (httpHeader.test(type))
    {
      this._parseResponse(message, rinfo)
    } else
    {
      this._parseCommand(message, rinfo)
    }
  }


  /**
   * Parses SSDP command.
   *
   * @param msg
   * @param rinfo
   */
  private _parseCommand(msg: string, rinfo: dgram.RemoteInfo)
  {
    var method = this._getMethod(msg)
      , headers = this._getHeaders(msg)

    switch (method)
    {
      case c.NOTIFY:
        this._notify(headers, msg, rinfo)
        break
      case c.M_SEARCH:
        this._msearch(headers, msg, rinfo)
        break
      default:
        this._logger('Unhandled command: %o', { 'message': msg, 'rinfo': rinfo })
    }
  }



  /**
   * Handles NOTIFY command
   * Emits `advertise-alive`, `advertise-bye` events.
   *
   * @param headers
   * @param msg
   * @param rinfo
   */
  protected _notify(headers: Headers, msg, rinfo: dgram.RemoteInfo)
  {
    if (!headers.NTS)
    {
      this._logger('Missing NTS header: %o', headers)
      return
    }

    switch (headers.NTS.toLowerCase())
    {
      // Device coming to life.

      case c.SSDP_ALIVE:
        this.emit(c.ADVERTISE_ALIVE, headers, rinfo)
        break

      // Device shutting down.
      case c.SSDP_BYE:
        this.emit(c.ADVERTISE_BYE, headers, rinfo)
        break

      default:
        this._logger('Unhandled NOTIFY event: %o', { 'message': msg, 'rinfo': rinfo })
    }
  }



  /**
   * Handles M-SEARCH command.
   *
   * @param headers
   * @param msg
   * @param rinfo
   */
  protected _msearch(headers: Headers, msg, rinfo: dgram.RemoteInfo)
  {
    this._logger('SSDP M-SEARCH event: %o', { 'ST': headers.ST, 'address': rinfo.address, 'port': rinfo.port })

    if (!headers.MAN || !headers.MX || !headers.ST) return

    this._respondToSearch(headers.ST, rinfo)
  }



  /**
   * Sends out a response to M-SEARCH commands.
   *
   * @param {String} serviceType Service type requested by a client
   * @param {Object} rinfo Remote client's address
   * @private
   */
  private _respondToSearch(serviceType: string, rinfo: dgram.RemoteInfo)
  {
    var self = this
      , peer_addr = rinfo.address
      , peer_port = rinfo.port
      , stRegex
      , acceptor

    // unwrap quoted string
    if (serviceType[0] == '"' && serviceType[serviceType.length - 1] == '"')
    {
      serviceType = serviceType.slice(1, -1)
    }

    if (self.options.allowWildcards)
    {
      stRegex = new RegExp(serviceType.replace(/\*/g, '.*') + '$')
      acceptor = function (usn, serviceType)
      {
        return serviceType === c.SSDP_ALL || stRegex.test(usn)
      }
    } else
    {
      acceptor = function (usn, serviceType)
      {
        return serviceType === c.SSDP_ALL || usn === serviceType
      }
    }

    Object.keys(self._usns).forEach(function (usn)
    {
      var udn = self._usns[usn]

      if (self.options.allowWildcards)
      {
        udn = udn.replace(stRegex, serviceType)
      }

      if (acceptor(usn, serviceType))
      {
        var pkt = self._getSSDPHeader(
          '200 OK', extend({
            'ST': serviceType === c.SSDP_ALL ? usn : serviceType,
            'USN': udn,
            'LOCATION': self._location,
            'CACHE-CONTROL': 'max-age=' + self.options.ttl,
            'DATE': new Date().toUTCString(),
            'SERVER': self.options.ssdpSig,
            'EXT': ''
          }, self.options.headers),
          true
        )

        self._logger('Sending a 200 OK for an M-SEARCH: %o', { 'peer': peer_addr, 'port': peer_port })

        var message = new Buffer(pkt)

        self._send(message, peer_addr, peer_port, function (err, bytes)
        {
          self._logger('Sent M-SEARCH response: %o', { 'message': pkt })
        })
      }
    })
  }



  /**
   * Parses SSDP response message.
   *
   * @param msg
   * @param rinfo
   */
  private _parseResponse(msg: string, rinfo: dgram.RemoteInfo)
  {
    this._logger('SSDP response: %o', { 'message': msg })

    var headers = this._getHeaders(msg)
      , statusCode = this._getStatusCode(msg)

    this.emit('response', headers, statusCode, rinfo)
  }



  public addUSN(device)
  {
    this._usns[device] = this.options.udn + '::' + device
  }



  protected _getSSDPHeader(method: string, headers: Headers, isResponse?: boolean)
  {
    var message = []

    method = method.toUpperCase()

    if (isResponse)
    {
      message.push('HTTP/1.1 ' + method)
    } else
    {
      message.push(method + ' * HTTP/1.1')
    }

    Object.keys(headers).forEach(function (header)
    {
      message.push(header + ': ' + headers[header])
    })

    message.push('\r\n')

    return message.join('\r\n')
  }



  private _getMethod(msg: string)
  {
    return msg.substr(0, msg.indexOf(' ')).toLowerCase();
  }



  public _getStatusCode(msg: string)
  {
    var indexOfFirstSpace = msg.indexOf(' ');
    return parseInt(msg.substring(indexOfFirstSpace, msg.indexOf(' ', indexOfFirstSpace + 1)));
  }



  public _getHeaders(msg: string): Headers
  {
    var lines = msg.split("\r\n")

    var headers = {}

    lines.forEach(function (line)
    {
      if (line.length)
      {
        var pairs = line.match(ssdpHeader)
        if (pairs)
          headers[pairs[1].toUpperCase()] = pairs[2] // e.g. {'HOST': 239.255.255.250:1900}
      }
    });

    return headers
  }



  protected _send(message: string | Buffer, host?, port?, cb?)
  {
    var self = this

    if (typeof host === 'function')
    {
      cb = host
      host = this.options.ssdpIp;
      port = this.options.ssdpPort
    }

    var ipAddresses = Object.keys(this.sockets)

    async.each(ipAddresses, function (ipAddress, next)
    {
      var socket = self.sockets[ipAddress];
      var ip = host;
      if (!ip)
      {
        if (net.isIPv4(ipAddress))
          ip = c.SSDP_DEFAULT_IP4;
        else if (net.isIPv6(ipAddress))
          ip = c.SSDP_DEFAULT_IP6_LINK;


      }
      if (ip)
        socket.send(message, 0, message.length, port, ip, next)
    }, cb)
  }
}

function getSsdpSignature()
{
  return 'node.js/' + nodeVersion + ' UPnP/1.1 ' + moduleName + '/' + moduleVersion
}