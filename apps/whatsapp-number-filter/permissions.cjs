function allowWhatsAppStorage(permission,requestingUrl){
 if(permission!=='persistent-storage')return false;
 try{return new URL(requestingUrl).origin==='https://web.whatsapp.com';}catch{return false;}
}
module.exports={allowWhatsAppStorage};
