#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AIRDOM v2.0 — تولید/به‌روزرسانی ۱۲ فایل JSON جنگنده‌ها
   اضافه‌شدن: rcs (سطح مقطع راداری)، radar (برد/کون)،
   موشک‌های چندایستگاهی (ir/sarh/arh)، gunDmg برای توپ‌های سنگین"""
import json, os

D = '/home/z/my-project/src/aircraft'

def upd(idfile, **kw):
    p = os.path.join(D, idfile + '.json')
    with open(p, encoding='utf-8') as f:
        j = json.load(f)
    j.update(kw)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(j, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('updated', idfile)

def msl(name, typ, count, rng):
    return {'name': name, 'type': typ, 'count': count, 'range': rng}

# ---------- به‌روزرسانی ۶ جنگنده فعلی ----------
upd('f16c',
    missiles=[msl('AIM-120C', 'arh', 2, 18000), msl('AIM-9L', 'ir', 2, 8000)],
    radar={'range': 90000, 'gimbal': 60}, rcs=4)

upd('f14b',
    missiles=[msl('AIM-54C', 'arh', 4, 30000), msl('AIM-9M', 'ir', 2, 8000)],
    radar={'range': 140000, 'gimbal': 65}, rcs=9)

upd('su27s',
    missiles=[msl('R-27ER', 'sarh', 4, 26000), msl('R-73', 'ir', 4, 9000)],
    radar={'range': 110000, 'gimbal': 60}, rcs=6)

upd('mig29a',
    missiles=[msl('R-27R', 'sarh', 2, 22000), msl('R-60M', 'ir', 4, 6000)],
    radar={'range': 70000, 'gimbal': 55}, rcs=5)

upd('mirage2000c',
    missiles=[msl('Super 530D', 'sarh', 2, 22000), msl('Magic II', 'ir', 2, 8000)],
    radar={'range': 80000, 'gimbal': 60}, rcs=4)

upd('jas39c',
    missiles=[msl('AIM-120C', 'arh', 4, 18000), msl('IRIS-T', 'ir', 2, 10000)],
    radar={'range': 90000, 'gimbal': 60}, rcs=3)

# ---------- ۶ جنگنده جدید ----------
NEW = [
{
  'id': 'f15c', 'name': 'F-15C Eagle', 'nation': 'USA', 'role': 'air superiority',
  'mass': 12700, 'fuelCap': 6100, 'thrustMil': 130400, 'thrustAB': 211400,
  'burnMil': 2.0, 'burnAB': 9.0, 'wingArea': 56.5, 'wingSpan': 13.05, 'len': 19.43,
  'CL0': 0.04, 'CLa': 4.4, 'aStall': 17, 'CD0': 0.023, 'kInd': 0.11,
  'maxG': 9, 'rollRate': 250, 'pitchRate': 20, 'yawRate': 7,
  'gearH': 2.4, 'bellyH': 1.3,
  'guns': [{'name': 'M61A1 VULCAN', 'ammo': 940}],
  'missiles': [msl('AIM-7M', 'sarh', 4, 26000), msl('AIM-9L', 'ir', 4, 8000)],
  'bombs': 2, 'rockets': 0, 'flares': 56, 'chaff': 64,
  'radar': {'range': 120000, 'gimbal': 65}, 'rcs': 8,
  'stats': {'speed': 0.95, 'agility': 0.75, 'firepower': 0.95, 'armor': 0.85},
  'visual': {'wingType': 'swept', 'tailType': 'twin', 'engines': 2,
             'body': '#7a8288', 'accent': '#46505c', 'fusW': 1.15},
  'cockpit': {'style': 'west', 'panel': '#2e343b', 'sideStick': False, 'mfds': 2},
  'hp': 120,
},
{
  'id': 'f4e', 'name': 'F-4E Phantom II', 'nation': 'USA', 'role': 'multirole',
  'mass': 13700, 'fuelCap': 6000, 'thrustMil': 104600, 'thrustAB': 159200,
  'burnMil': 2.3, 'burnAB': 10.5, 'wingArea': 49.2, 'wingSpan': 11.77, 'len': 19.2,
  'CL0': 0.05, 'CLa': 4.2, 'aStall': 16, 'CD0': 0.028, 'kInd': 0.12,
  'maxG': 7.5, 'rollRate': 200, 'pitchRate': 16, 'yawRate': 6,
  'gearH': 2.4, 'bellyH': 1.35,
  'guns': [{'name': 'M61A1 VULCAN', 'ammo': 640}],
  'missiles': [msl('AIM-7E', 'sarh', 4, 20000), msl('AIM-9J', 'ir', 4, 6000)],
  'bombs': 4, 'rockets': 0, 'flares': 48, 'chaff': 48,
  'radar': {'range': 70000, 'gimbal': 55}, 'rcs': 11,
  'stats': {'speed': 0.92, 'agility': 0.5, 'firepower': 0.8, 'armor': 0.8},
  'visual': {'wingType': 'swept', 'tailType': 'twin', 'engines': 2,
             'body': '#8d9299', 'accent': '#57616e', 'fusW': 1.2},
  'cockpit': {'style': 'west', 'panel': '#35393f', 'sideStick': False, 'mfds': 1},
  'hp': 115,
},
{
  'id': 'mig21bis', 'name': 'MiG-21bis Fishbed', 'nation': 'RUSSIA', 'role': 'interceptor',
  'mass': 5350, 'fuelCap': 2750, 'thrustMil': 40200, 'thrustAB': 69600,
  'burnMil': 0.85, 'burnAB': 3.9, 'wingArea': 23.0, 'wingSpan': 7.15, 'len': 14.5,
  'CL0': 0.06, 'CLa': 4.3, 'aStall': 26, 'CD0': 0.024, 'kInd': 0.13,
  'maxG': 8, 'rollRate': 260, 'pitchRate': 20, 'yawRate': 7,
  'gearH': 2.2, 'bellyH': 1.15,
  'guns': [{'name': 'GSh-23L', 'ammo': 200}], 'gunDmg': 12,
  'missiles': [msl('R-3S', 'ir', 4, 5500)],
  'bombs': 2, 'rockets': 32, 'flares': 36, 'chaff': 36,
  'radar': {'range': 28000, 'gimbal': 45}, 'rcs': 3,
  'stats': {'speed': 0.95, 'agility': 0.82, 'firepower': 0.5, 'armor': 0.6},
  'visual': {'wingType': 'delta', 'tailType': 'single', 'engines': 1,
             'body': '#97a08c', 'accent': '#5c6653', 'fusW': 0.85},
  'cockpit': {'style': 'russia', 'panel': '#29423a', 'sideStick': False, 'mfds': 1},
  'hp': 65,
},
{
  'id': 'mig23ml', 'name': 'MiG-23ML Flogger', 'nation': 'RUSSIA', 'role': 'fighter',
  'mass': 10700, 'fuelCap': 4400, 'thrustMil': 83400, 'thrustAB': 121000,
  'burnMil': 1.9, 'burnAB': 8.5, 'wingArea': 37.3, 'wingSpan': 13.97, 'len': 16.7,
  'CL0': 0.05, 'CLa': 4.5, 'aStall': 18, 'CD0': 0.027, 'kInd': 0.12,
  'maxG': 8, 'rollRate': 230, 'pitchRate': 19, 'yawRate': 7,
  'gearH': 2.3, 'bellyH': 1.25,
  'guns': [{'name': 'GSh-23L', 'ammo': 200}], 'gunDmg': 12,
  'missiles': [msl('R-23R', 'sarh', 2, 24000), msl('R-60M', 'ir', 4, 6000)],
  'bombs': 2, 'rockets': 0, 'flares': 48, 'chaff': 48,
  'radar': {'range': 85000, 'gimbal': 55}, 'rcs': 7,
  'stats': {'speed': 0.9, 'agility': 0.72, 'firepower': 0.7, 'armor': 0.7},
  'visual': {'wingType': 'variable', 'tailType': 'single', 'engines': 1,
             'body': '#7e8878', 'accent': '#4a544a', 'fusW': 1.0},
  'cockpit': {'style': 'russia', 'panel': '#2a4238', 'sideStick': False, 'mfds': 1},
  'hp': 90,
},
{
  'id': 'su25', 'name': 'Su-25 Frogfoot', 'nation': 'RUSSIA', 'role': 'attack',
  'mass': 9800, 'fuelCap': 4000, 'thrustMil': 80400, 'thrustAB': 88300,
  'burnMil': 1.5, 'burnAB': 5.5, 'wingArea': 30.1, 'wingSpan': 14.36, 'len': 15.53,
  'CL0': 0.07, 'CLa': 4.6, 'aStall': 22, 'CD0': 0.032, 'kInd': 0.12,
  'maxG': 6.5, 'rollRate': 180, 'pitchRate': 14, 'yawRate': 8,
  'gearH': 2.3, 'bellyH': 1.25,
  'guns': [{'name': 'GSh-30-2', 'ammo': 250}], 'gunDmg': 22,
  'missiles': [msl('R-60M', 'ir', 2, 5000)],
  'bombs': 8, 'rockets': 64, 'flares': 128, 'chaff': 128,
  'radar': None, 'rcs': 10,
  'stats': {'speed': 0.6, 'agility': 0.55, 'firepower': 0.85, 'armor': 1.0},
  'visual': {'wingType': 'swept', 'tailType': 'single', 'engines': 1,
             'body': '#6d7462', 'accent': '#46503e', 'fusW': 1.1},
  'cockpit': {'style': 'russia', 'panel': '#26403a', 'sideStick': False, 'mfds': 1},
  'hp': 150,
},
{
  'id': 'a10a', 'name': 'A-10A Thunderbolt II', 'nation': 'USA', 'role': 'attack',
  'mass': 11300, 'fuelCap': 4900, 'thrustMil': 80600, 'thrustAB': 80600,
  'burnMil': 1.4, 'burnAB': 1.4, 'wingArea': 47.0, 'wingSpan': 17.53, 'len': 16.26,
  'CL0': 0.09, 'CLa': 4.8, 'aStall': 20, 'CD0': 0.038, 'kInd': 0.11,
  'maxG': 7, 'rollRate': 160, 'pitchRate': 13, 'yawRate': 9,
  'gearH': 2.5, 'bellyH': 1.3,
  'guns': [{'name': 'GAU-8/A AVENGER', 'ammo': 1174}], 'gunDmg': 24,
  'missiles': [msl('AIM-9L', 'ir', 2, 8000)],
  'bombs': 8, 'rockets': 38, 'flares': 120, 'chaff': 120,
  'radar': None, 'rcs': 12,
  'stats': {'speed': 0.45, 'agility': 0.5, 'firepower': 0.95, 'armor': 1.0},
  'visual': {'wingType': 'straight', 'tailType': 'single', 'engines': 1,
             'body': '#707a6b', 'accent': '#3f4a38', 'fusW': 1.15},
  'cockpit': {'style': 'west', 'panel': '#2e3236', 'sideStick': False, 'mfds': 1},
  'hp': 160,
},
]

for spec in NEW:
    p = os.path.join(D, spec['id'] + '.json')
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('created', spec['id'])
print('DONE — 12 aircraft')
