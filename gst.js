/* AEHRAN GST Service — single shared calculation source for storefront, admin and server parity. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(null);
  else factory(root);
})(typeof window!=='undefined'?window:null,function(root){
  'use strict';
  const STATES=[
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
  ];
  const DEFAULTS={enabled:true,gstin:'',businessCountry:'India',businessState:'West Bengal',defaultRate:5,higherRate:12,threshold:1000,mode:'exclusive'};
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const stateKey=v=>String(v||'').trim().toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
  function normalize(s){s=s&&typeof s==='object'?s:{};const out={...DEFAULTS,...s};out.enabled=out.enabled!==false;out.gstin=String(out.gstin||'').trim().toUpperCase();out.businessCountry=String(out.businessCountry||DEFAULTS.businessCountry);out.businessState=String(out.businessState||DEFAULTS.businessState);out.defaultRate=Math.max(0,num(out.defaultRate,5));out.higherRate=Math.max(0,num(out.higherRate,12));out.threshold=Math.max(0,num(out.threshold,1000));out.mode=String(out.mode||'exclusive').toLowerCase()==='inclusive'?'inclusive':'exclusive';return out}
  function validateGSTIN(gstin){const v=String(gstin||'').replace(/\s+/g,'').trim().toUpperCase();if(!v)return true;if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v))return false;const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';let total=0;for(let i=0;i<14;i++){const n=chars.indexOf(v[i]);if(n<0)return false;const p=n*(i%2===0?1:2);total+=Math.floor(p/36)+(p%36)}const check=chars[(36-(total%36))%36];return v[14]===check}
  function rateFor(value,s){s=normalize(s);return !s.enabled?0:(num(value)<=s.threshold?s.defaultRate:s.higherRate)}
  function calc(value,s){s=normalize(s);const gross=round2(value);if(!s.enabled)return {input:gross,taxableAmount:gross,gstRate:0,gstAmount:0,total:gross,mode:s.mode};if(s.mode==='inclusive'){const baseRate=s.defaultRate,baseTax=round2(gross*baseRate/(100+baseRate)),baseTaxable=round2(gross-baseTax),rate=baseTaxable<=s.threshold?s.defaultRate:s.higherRate;if(rate<=0)return {input:gross,taxableAmount:gross,gstRate:0,gstAmount:0,total:gross,mode:s.mode};const tax=round2(gross*rate/(100+rate));return {input:gross,taxableAmount:round2(gross-tax),gstRate:rate,gstAmount:tax,total:gross,mode:s.mode}}const rate=rateFor(gross,s);if(rate<=0)return {input:gross,taxableAmount:gross,gstRate:0,gstAmount:0,total:gross,mode:s.mode};const tax=round2(gross*rate/100);return {input:gross,taxableAmount:gross,gstRate:rate,gstAmount:tax,total:round2(gross+tax),mode:s.mode}}
  function split(gst,sellerState,customerState){const amount=round2(gst);if(!amount)return {cgstAmount:0,sgstAmount:0,igstAmount:0,cgstRate:0,sgstRate:0,igstRate:0,taxType:'NONE'};if(stateKey(sellerState)&&stateKey(sellerState)===stateKey(customerState)){const half=round2(amount/2);return {cgstAmount:half,sgstAmount:round2(amount-half),igstAmount:0,cgstRate:null,sgstRate:null,igstRate:0,taxType:'CGST_SGST'}}return {cgstAmount:0,sgstAmount:0,igstAmount:amount,cgstRate:0,sgstRate:0,igstRate:null,taxType:'IGST'} }
  function calcCart(items,s,discount=0,sellerState='',customerState=''){
    s=normalize(s);const rows=(Array.isArray(items)?items:[]).map(x=>({...x,qty:Math.max(0,num(x.qty??x.quantity,1)),price:Math.max(0,num(x.price??x.unitPrice,0)),old:Math.max(0,num(x.old??x.mrp??x.price, x.price??0))})).filter(x=>x.qty>0);
    const grossSubtotal=round2(rows.reduce((a,x)=>a+x.price*x.qty,0));
    const safeDiscount=Math.min(grossSubtotal,Math.max(0,num(discount)));
    let remaining=safeDiscount, taxable=0,gst=0,totalBeforeShipping=0;
    const mapped=rows.map((x,i)=>{const lineGross=round2(x.price*x.qty);const lineDiscount=i===rows.length-1?remaining:round2(safeDiscount*(lineGross/(grossSubtotal||1)));remaining=round2(remaining-lineDiscount);const afterDiscount=round2(lineGross-lineDiscount);const c=calc(afterDiscount,s);const parts=split(c.gstAmount,s.businessState,customerState);taxable=round2(taxable+c.taxableAmount);gst=round2(gst+c.gstAmount);totalBeforeShipping=round2(totalBeforeShipping+c.total);return {...x,lineGross,lineDiscount,taxableAmount:c.taxableAmount,gstRate:c.gstRate,gstAmount:c.gstAmount,...parts}});
    const parts=split(gst,s.businessState,customerState);
    const singleRate=mapped.length&&mapped.every(x=>x.gstRate===mapped[0].gstRate)?(mapped[0].gstRate||0):null;return {subtotal:grossSubtotal,discount:safeDiscount,taxableAmount:taxable,gstEnabled:s.enabled,gstRate:singleRate,gstAmount:gst,cgstAmount:parts.cgstAmount,sgstAmount:parts.sgstAmount,igstAmount:parts.igstAmount,cgstRate:parts.taxType==='CGST_SGST'&&singleRate!=null?singleRate/2:0,sgstRate:parts.taxType==='CGST_SGST'&&singleRate!=null?singleRate/2:0,igstRate:parts.taxType==='IGST'&&singleRate!=null?singleRate:0,taxType:parts.taxType,shippingAmount:0,grandTotal:round2(totalBeforeShipping),items:mapped,mode:s.mode,sellerState:s.businessState,customerState:String(customerState||'')};
  }
  function withShipping(result,shipping){const ship=round2(shipping);return {...result,shippingAmount:ship,grandTotal:round2(result.grandTotal+ship)} }
  const api={STATES,DEFAULTS,normalize,validateGSTIN,rateFor,calculate:calc,split,calculateCart:calcCart,withShipping,round2};
  if(root)root.AEHRAN_GST=api;
  return api;
});
