import { DEFAULT_PORTFOLIOS, validDefaultScope } from '../data/default-portfolios';
import { products } from '../data/content';
import type { GameState, DefaultScope } from '../types';
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const equal=(a:number,b:number)=>Math.abs(a-b)<.01;
const unique=(xs:string[])=>new Set(xs).size===xs.length;

/** 새 장부는 합계·출처·주문 연결을 함께 검증한다. 구 저장에 출처를 추정해 넣지 않는다. */
export function validDefaultLedger(g: Omit<GameState,'campaign'>): boolean {
  const d=g.defaultTrading;
  if(g.rulesetVersion!=='2026-09-10-e') return !d && g.holdings.every(h=>!h.positions) && g.pendingOrders.every(o=>!o.defaultScope);
  if(!d||d.version!=='e1'||!Array.isArray(d.groups)||d.groups.length>24) return false;
  const scopeOk=(s:DefaultScope|undefined)=>!!s&&s.optionVersion==='e1'&&typeof s.mandateId==='string'&&s.mandateId.length<80&&DEFAULT_PORTFOLIOS.some(p=>p.id===s.optionId);
  if(!d.groups.every(group=>group&&typeof group.id==='string'&&typeof group.commandId==='string'&&group.commandId.length<100&&['in','out'].includes(group.kind)&&scopeOk(group.scope)&&nonnegative(group.amount)&&group.amount>0&&Number.isInteger(group.turn)&&group.turn>=1&&group.turn<=g.turn&&Array.isArray(group.orderIds)&&group.orderIds.every(id=>typeof id==='string')&&unique(group.orderIds))) return false;
  if(!unique(d.groups.map(x=>x.id))||!unique(d.groups.map(x=>x.commandId))) return false;
  const known=(scope:DefaultScope)=>d.groups.some(x=>x.scope.mandateId===scope.mandateId&&x.scope.optionId===scope.optionId&&x.scope.optionVersion===scope.optionVersion);
  if(!unique(g.holdings.map(h=>h.productId))||!unique(g.pendingOrders.map(o=>o.id))) return false;
  for(const h of g.holdings) {
    if(!products.some(p=>p.id===h.productId)||!Array.isArray(h.positions)||!nonnegative(h.amount)||!nonnegative(h.principal)) return false;
    if(!unique(h.positions.map(p=>p.id))) return false;
    for(const p of h.positions) {
      if(typeof p.id!=='string'||!['manual','default'].includes(p.source)||!nonnegative(p.amount)||!nonnegative(p.principal)||!nonnegative(p.depositTurnsHeld)||(p.units!==undefined&&!nonnegative(p.units))) return false;
      if(p.source==='manual' ? !!p.scope : !scopeOk(p.scope)||!validDefaultScope(p.scope,h.productId)||!known(p.scope!)) return false;
      if(h.productId==='deposit'&&p.lots?.length) {
        if(!p.lots.every(l=>[l.amount,l.principal,l.openedTurn,l.maturityTurn,l.ratePerTurn].every(nonnegative)&&l.maturityTurn>=l.openedTurn)||!equal(p.amount,p.lots.reduce((s,l)=>s+l.amount,0))||!equal(p.principal,p.lots.reduce((s,l)=>s+l.principal,0))) return false;
      }
    }
    if(!equal(h.amount,h.positions.reduce((s,p)=>s+p.amount,0))||!equal(h.principal,h.positions.reduce((s,p)=>s+p.principal,0))) return false;
  }
  return g.pendingOrders.every(o=>!o.defaultScope||(validDefaultScope(o.defaultScope,o.productId)&&known(o.defaultScope)&&d.groups.some(group=>group.id===o.groupId&&group.orderIds.includes(o.id)&&group.scope.mandateId===o.defaultScope!.mandateId)&&!o.targetProductId));
}
