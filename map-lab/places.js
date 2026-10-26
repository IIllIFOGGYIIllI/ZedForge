/* ZedForge: Nasdara permanent place names and grid-square centres.
 * Coordinates are APPROXIMATE 100-metre grid-centres, NOT surveyed building
 * locations. Transcribed from published Nasdara place-name grid listings:
 * https://www.nasdaramap.com/guide
 * No event spawns, vehicle spawns, or third-party images bundled.
 * Cited for source attribution; names/coordinates are geographic facts.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ZedForgePlaces=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const SOURCE_URL='https://www.nasdaramap.com/guide';
 const POSITION_ACCURACY='100m grid square (centre shown; approximately ±50m per axis)';
 const DATA=[["Dashtabad","104 057","city"],["Nasdara","101 121","city"],["Kamar Zir","094 044","town"],["Shah Yailaq","101 081","town"],["Bam-e Sabz","087 078","town"],["Pesh Kuh","037 054","town"],["Gandomabad","078 039","town"],["Khorramabad","046 055","town"],["Sabzabad","068 089","town"],["No Abad","069 111","town"],["Gard Abad","110 087","town"],["Kucha Dar","045 062","town"],["Bustanshahr","073 107","town"],["Dar-e Ardis","039 111","town"],["OKB-754","065 064","town"],["Terminal Nas","109 125","town"],["Shinkalay","083 062","village"],["Dehqankalay","099 058","village"],["Mal Kalay","095 075","village"],["Bagh-e Mir","047 107","village"],["Tut Dara","054 083","village"],["Anar Juy","055 073","village"],["Karizak","035 035","village"],["Chashme Sabz","066 036","village"],["Gul Zar","050 098","village"],["Sabz Pashan","045 046","village"],["Kati Golzar","062 045","village"],["Tor Dara","041 070","village"],["Mian Deh","073 122","village"],["Sar-e Deh","030 101","village"],["Pay-e Kuh","063 106","village"],["Bala Kalay","044 087","village"],["Payan Kalay","093 088","village"],["Qala-e Kuhna","044 041","village"],["Pir Kalay","076 077","village"],["Bazar-e Kohna","079 083","village"],["Darvazeh-e Gharb","049 027","village"],["Yak Chinar","058 066","village"],["Panj Asyab","058 028","village"],["Chahar Tut","080 076","village"],["Marz-e Lut","137 036","village"],["Pesh Dasht","113 069","village"],["Dahaneh-e Kavir","112 138","village"],["Kariz-e Marz","107 078","village"],["Manda Marz","053 057","village"],["Bad Asyab","085 049","village"],["Suvin Shahr","057 037","village"],["Mian Dara","088 038","village"],["Dara-e Nur","109 024","village"],["Gul Dara","070 119","village"],["Bagh-e Dara","094 131","village"],["Salar Abad","079 067","village"],["Tut Mian","079 096","village"],["Bar Kalay","073 032","village"],["Dost Kalay","066 050","village"],["Shinkay Wadi","070 043","village"],["Dahana","102 045","village"],["Varzaneh","133 042","village"],["Karkhana District","091 121","industrial"],["Ziarat District","101 122","industrial"],["Jui Bar District","093 116","industrial"],["Registan District","106 117","industrial"],["Sarman-Naft refinery","107 104","industrial"],["Nasdar-Beton factory","097 098","industrial"],["Dashtabad Airbase","119 057","airfield"],["Zulfiqar missile base","027 072","military"],["COP Neptune","128 097","military"],["FOB Atlas","083 106","military"],["COP Razorback","047 090","military"],["COP Kestrel","042 034","military"],["COP Condor","077 045","military"],["Baza Zenit","063 064","military"],["NII-Mirnyy","061 071","military"],["Spets-Stvol 754","066 060","military"],["Proval-754","071 062","military"],["Dar-e Ardis Military Checkpoint","044 116","military"],["Salar Abad Military Checkpoint","072 067","military"],["Pesh Dasht Military Camp","113 073","military"]];
 const points=DATA.map(([name,grid,kind])=>{
   const [easting,northing]=grid.split(' ').map(Number);
   return Object.freeze({name,x:easting*100+50,z:northing*100+50,kind,grid,source:'community-grid-100m',approximate:true});
 });
 const grouped=Object.freeze(points.reduce((a,p)=>(a[p.kind]=(a[p.kind]||0)+1,a),{}));
 return Object.freeze({SOURCE_URL,POSITION_ACCURACY,points:Object.freeze(points),count:points.length,grouped});
});