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


export const SSDP_ALIVE = 'ssdp:alive';
export const SSDP_BYE = 'ssdp:byebye';
export const SSDP_ALL = 'ssdp:all';
export const ADVERTISE_ALIVE = 'advertise-alive';
export const ADVERTISE_BYE = 'advertise-bye';
export const NOTIFY = 'notify';
export const M_SEARCH = 'm-search';
export const SSDP_DEFAULT_IP4 = '239.255.255.250';
export const SSDP_DEFAULT_IP6_NODE = 'FF01::C';
export const SSDP_DEFAULT_IP6_LINK = 'FF02::C';
export const SSDP_DEFAULT_IP6_SITE = 'FF05::C';
export const SSDP_DEFAULT_IP6_ORG = 'FF08::C';
export const SSDP_DEFAULT_IP6_GLOBAL = 'FF0E::C';
export const SSDP_DEFAULT_PORT = 1900;