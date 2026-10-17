import math
NAVY='#0F1C24'; SNL='#1AA7DE'; LEAF='#7CB92B'; LEAFD='#4E9A1F'; LEAFL='#C5E88A'; SUN='#F9A825'; SUND='#F57C00'
COLS={'N':('#E03131','#A31414'),'E':('#F7941D','#C46A0C'),'S':('#2F62E6','#1A3A9E'),'W':('#17A85F','#0B6E40')}
FONT='@font-face{font-family:Heebo;src:url(https://fonts.gstatic.com/s/heebo/v26/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSysd0mm_00.ttf);font-weight:100 900}'
DEFS='''<defs>
<radialGradient id="gR" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#FF7A6B"/><stop offset="0.55" stop-color="#D62828"/><stop offset="1" stop-color="#7A0E0E"/></radialGradient>
<radialGradient id="gY" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#FFF3A6"/><stop offset="0.55" stop-color="#F9C513"/><stop offset="1" stop-color="#B8860B"/></radialGradient>
<linearGradient id="gHex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B3A50"/><stop offset="1" stop-color="#0B1820"/></linearGradient>
<linearGradient id="gSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD05A"/><stop offset="1" stop-color="#F57C00"/></linearGradient>
</defs>'''

def emblem(cx, cy, mode='color', scale=1.0, clipid='hc'):
    """Hexagon badge emblem, designed on a 262-radius hexagon around (cx,cy)."""
    def pt(a,r): a=math.radians(a); return (cx+r*math.cos(a)*scale, cy+r*math.sin(a)*scale)
    def P(dx,dy): return (cx+dx*scale, cy+dy*scale)
    def hexpts(r): return ' '.join(f'{p[0]:.1f},{p[1]:.1f}' for p in (pt(a,r) for a in (-90,-30,30,90,150,210)))
    def kite(ang,length,half,light,dark):
        t=pt(ang,length); l=pt(ang-90,half); r=pt(ang+90,half)
        return (f'<polygon points="{t[0]:.1f},{t[1]:.1f} {cx},{cy} {l[0]:.1f},{l[1]:.1f}" fill="{dark}"/>'
                f'<polygon points="{t[0]:.1f},{t[1]:.1f} {cx},{cy} {r[0]:.1f},{r[1]:.1f}" fill="{light}"/>')
    def ell(a,rx,ry,rot):
        x=rx*math.cos(math.radians(a)); y=ry*math.sin(math.radians(a)); t=math.radians(rot)
        return (cx+(x*math.cos(t)-y*math.sin(t))*scale, cy+(x*math.sin(t)+y*math.cos(t))*scale)
    mono = mode=='mono'; rev = mode=='reverse'
    ink = NAVY if mono else '#FFFFFF'
    S=f'<clipPath id="{clipid}"><polygon points="{hexpts(236)}"/></clipPath>'
    # hexagon
    if mono:
        S+=f'<polygon points="{hexpts(262)}" fill="#FFFFFF" stroke="{NAVY}" stroke-width="{14*scale:.1f}"/>'
        S+=f'<polygon points="{hexpts(236)}" fill="none" stroke="{NAVY}" stroke-width="{3*scale:.1f}" stroke-opacity="0.5"/>'
    else:
        S+=f'<polygon points="{hexpts(262)}" fill="{"#0F1C24" if rev else "url(#gHex)"}" stroke="{"#FFFFFF" if rev else "none"}" stroke-width="{6*scale:.1f}"/>'
        S+=f'<polygon points="{hexpts(236)}" fill="none" stroke="{SNL}" stroke-width="{4*scale:.1f}" stroke-opacity="0.85"/>'
    # panel grid + sun glow
    S+=f'<g clip-path="url(#{clipid})">'
    if not mono:
        S+=f'<circle cx="{cx}" cy="{cy+230*scale:.1f}" r="{150*scale:.1f}" fill="url(#gSun)" opacity="0.22"/>'
        S+=f'<rect x="{cx-260*scale:.1f}" y="{cy+118*scale:.1f}" width="{520*scale:.1f}" height="{140*scale:.1f}" fill="#0A1A26" opacity="0.55"/>'
    gl = NAVY if mono else SNL; gop = 0.35
    for i in range(4): S+=f'<line x1="{cx-260*scale:.1f}" y1="{cy+(118+i*35)*scale:.1f}" x2="{cx+260*scale:.1f}" y2="{cy+(118+i*35)*scale:.1f}" stroke="{gl}" stroke-opacity="{gop}" stroke-width="{2*scale:.1f}"/>'
    for i in range(-5,6): S+=f'<line x1="{cx+i*52*scale:.1f}" y1="{cy+118*scale:.1f}" x2="{cx+i*52*scale:.1f}" y2="{cy+258*scale:.1f}" stroke="{gl}" stroke-opacity="{gop}" stroke-width="{2*scale:.1f}"/>'
    S+=f'<line x1="{cx-260*scale:.1f}" y1="{cy+118*scale:.1f}" x2="{cx+260*scale:.1f}" y2="{cy+118*scale:.1f}" stroke="{NAVY if mono else SUN}" stroke-width="{4*scale:.1f}" stroke-opacity="0.9"/>'
    S+='</g>'
    # orbits
    oc = NAVY if mono else '#5BC0EC'
    for rot in (-28,32):
        S+=f'<ellipse cx="{cx}" cy="{cy}" rx="{205*scale:.1f}" ry="{82*scale:.1f}" transform="rotate({rot} {cx} {cy})" fill="none" stroke="{oc}" stroke-width="{2.5*scale:.1f}" stroke-dasharray="{4*scale:.1f} {9*scale:.1f}" stroke-opacity="{0.6 if mono else 0.9}"/>'
    for a,rot in ((160,-28),(180,-28),(200,-28),(0,32),(20,32)):
        p=ell(a,205,82,rot); S+=f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{7*scale:.1f}" fill="{NAVY if mono else "#7DD3F5"}"/>'
    # compass
    if mono:
        for a in (45,135,225,315): S+=kite(a,100,17,'#8B96A1','#5B6B7A')
        for a in (270,0,90,180): S+=kite(a,158,29,'#3C4650',NAVY)
    else:
        for a in (45,135,225,315): S+=kite(a,100,17,'#D3DAE1','#8B96A1')
        for a,k in ((270,'N'),(0,'E'),(90,'S'),(180,'W')): S+=kite(a,158,29,*COLS[k])
    # nucleus
    s=31*scale
    balls=[(0,-0.62,'Y'),(-0.56,-0.3,'R'),(0.56,-0.3,'R'),(0,0,'Y'),(-0.56,0.34,'R'),(0.56,0.34,'R'),(0,0.64,'Y'),(-0.3,-0.02,'R'),(0.3,0.02,'Y')]
    balls.sort(key=lambda b:b[1])
    S+=f'<circle cx="{cx}" cy="{cy}" r="{s*1.12:.1f}" fill="#FFFFFF" opacity="0.9"/>'
    for dx,dy,c in balls:
        if mono: S+=f'<circle cx="{cx+dx*s:.1f}" cy="{cy+dy*s:.1f}" r="{s*0.44:.1f}" fill="{"#FFFFFF" if c=="Y" else NAVY}" stroke="{NAVY}" stroke-width="{2*scale:.1f}"/>'
        else:    S+=f'<circle cx="{cx+dx*s:.1f}" cy="{cy+dy*s:.1f}" r="{s*0.44:.1f}" fill="url(#g{c})"/>'
    # leaf
    def c(dx,dy): p=P(dx,dy); return f'{p[0]:.1f} {p[1]:.1f}'
    outer=f'M{c(62,200)} C {c(210,190)} {c(215,40)} {c(150,-45)} C {c(120,60)} {c(70,120)} {c(62,200)} Z'
    inner=f'M{c(62,200)} C {c(170,170)} {c(185,50)} {c(150,-45)} C {c(135,70)} {c(90,130)} {c(62,200)} Z'
    vein =f'M{c(62,200)} C {c(120,120)} {c(140,40)} {c(150,-45)}'
    if mono:
        S+=f'<path d="{outer}" fill="#FFFFFF" stroke="{NAVY}" stroke-width="{4*scale:.1f}"/><path d="{vein}" fill="none" stroke="{NAVY}" stroke-width="{3*scale:.1f}"/>'
        p=P(168,-62); S+=f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{12*scale:.1f}" fill="{NAVY}"/>'
    else:
        S+=f'<path d="{outer}" fill="{LEAFD}"/><path d="{inner}" fill="{LEAF}"/><path d="{vein}" fill="none" stroke="{LEAFL}" stroke-width="{3.5*scale:.1f}"/>'
        p=P(168,-62); S+=f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{12*scale:.1f}" fill="{SUND}"/>'
    return S

def page(w,h,body,bg='#FFFFFF'):
    return (f'<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>{FONT}html,body{{margin:0;background:#fff}}'
            f'#logo{{width:{w}px;height:{h}px;position:relative;font-family:Heebo,sans-serif}}</style></head><body><div id="logo">'
            f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">{DEFS}'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg></div></body></html>')

SLOGAN='פנלים, ממירים, אגירה וקונסטרוקציה. במלאי, במקום אחד.'

def badge(mode):
    bg = NAVY if mode=='reverse' else '#FFFFFF'
    ink = '#FFFFFF' if mode=='reverse' else NAVY
    sub = '#AFC3D3' if mode=='reverse' else '#3C4650'
    sub2 = '#7A8794'
    B = emblem(512,380,mode)
    B+=f'<text x="512" y="748" text-anchor="middle" font-family="Heebo" font-weight="900" font-size="92" fill="{ink}" direction="ltr" letter-spacing="4">SUNSTOCK</text>'
    B+=f'<text x="512" y="804" text-anchor="middle" font-family="Heebo" font-weight="700" font-size="38" fill="{ink}">סאנסטוק</text>'
    B+=f'<line x1="412" y1="830" x2="612" y2="830" stroke="{SUND if mode!="mono" else NAVY}" stroke-width="4" stroke-linecap="round"/>'
    B+=f'<text x="512" y="880" text-anchor="middle" font-family="Heebo" font-weight="500" font-size="29" fill="{sub}">{SLOGAN}</text>'
    B+=f'<text x="512" y="930" text-anchor="middle" font-family="Heebo" font-weight="600" font-size="26" fill="{sub2}" direction="ltr">B.E.E × SNL</text>'
    return page(1024,1024,B,bg)

def lockup(mode):
    bg = NAVY if mode=='reverse' else '#FFFFFF'
    ink = '#FFFFFF' if mode=='reverse' else NAVY
    sub = '#AFC3D3' if mode=='reverse' else '#3C4650'
    L = emblem(300,300,mode,scale=0.95,clipid='hl')
    L+=f'<text x="620" y="265" font-family="Heebo" font-weight="900" font-size="150" fill="{ink}" direction="ltr" letter-spacing="6" text-anchor="start" style="direction:ltr">SUNSTOCK</text>'
    L+=f'<line x1="620" y1="300" x2="1520" y2="300" stroke="{SUND if mode!="mono" else NAVY}" stroke-width="5" stroke-linecap="round"/>'
    L+=f'<text x="1070" y="372" text-anchor="middle" font-family="Heebo" font-weight="700" font-size="52" fill="{ink}">סאנסטוק · B.E.E × SNL</text>'
    L+=f'<text x="1070" y="446" text-anchor="middle" font-family="Heebo" font-weight="500" font-size="40" fill="{sub}">{SLOGAN}</text>'
    return page(1800,600,L,bg)

def icon():
    return page(600,600, emblem(300,300,'color',scale=1.1,clipid='hi'))

open('ss_badge_color.html','w',encoding='utf-8').write(badge('color'))
open('ss_badge_mono.html','w',encoding='utf-8').write(badge('mono'))
open('ss_badge_reverse.html','w',encoding='utf-8').write(badge('reverse'))
open('ss_lockup_color.html','w',encoding='utf-8').write(lockup('color'))
open('ss_lockup_reverse.html','w',encoding='utf-8').write(lockup('reverse'))
open('ss_icon.html','w',encoding='utf-8').write(icon())
print('ok')

def sheet():
    W,H=1600,2440
    B=''
    def h(y,t,size=44): return f'<text x="1520" y="{y}" text-anchor="start" font-family="Heebo" font-weight="800" font-size="{size}" fill="{NAVY}">{t}</text>'
    def p(y,t,size=26,fill='#3C4650'): return f'<text x="1520" y="{y}" text-anchor="start" font-family="Heebo" font-weight="400" font-size="{size}" fill="{fill}">{t}</text>'
    B+=f'<rect width="{W}" height="150" fill="{NAVY}"/>'
    B+=f'<text x="80" y="95" font-family="Heebo" font-weight="900" font-size="64" fill="#FFFFFF" direction="ltr" letter-spacing="4" style="direction:ltr">SUNSTOCK</text>'
    B+=f'<text x="1520" y="92" text-anchor="start" font-family="Heebo" font-weight="700" font-size="40" fill="#FFFFFF">דף מותג · גרסה 1</text>'
    B+=f'<image xlink:href="ss_icon.png" x="80" y="230" width="420" height="420"/>'
    B+=h(230,'1. השם')
    for k,t in enumerate(['SUNSTOCK = שמש + מלאי. השם אומר בשתי מילים מה אנחנו:','הציוד הסולארי שנמצא במלאי, עכשיו.','בעברית: סאנסטוק. קריא לקבלנים, למתקינים וללקוחות קצה,','ועובד גם באנגלית מול ספקים כמו Aiko ו-CSEC.','חתימת הבעלים B.E.E × SNL מופיעה קטנה מתחת לשם בכל גרסה,','כדי שהמותג החדש יוביל ושני המותגים יגבו אותו.']):
        B+=p(282+k*40,t)
    B+=h(590,'2. סלוגן')
    B+=p(642,'ראשי (על הלוגו): פנלים, ממירים, אגירה וקונסטרוקציה. במלאי, במקום אחד.',26,NAVY)
    B+=p(684,'קצר (שלטים, רכבים): הציוד הסולארי. במלאי.')
    B+=p(724,'מכירתי (הצעות מחיר, אתר): מהפנל ועד האגירה, מהמחסן שלנו לגג שלכם.')
    B+=p(764,'ספקים (באנגלית): Solar, storage and mounting. In stock. One source.')
    B+=h(850,'3. מה יש בסמל')
    for k,t in enumerate(['משושה = תא כוורת (B.E.E) וגם מחסן: צורה שמתחברת ליחידות נוספות.','מצפן בצבעי B.E.E עם גרעין האטום במרכז: הנדסה ודיוק.','עלה ונקודת שמש של SNL: אנרגיה נקייה. רשת פנלים ושמש עולה בתחתית: המלאי שעליו הכל נשען.','מסלולים ונקודות: הרשת הארצית של הלקוחות והמתקינים.']):
        B+=p(902+k*40,t)
    B+=h(1090,'4. גרסאות הלוגו')
    B+=f'<image xlink:href="ss_badge_color.png" x="1100" y="1130" width="420" height="420"/>'
    B+=f'<image xlink:href="ss_badge_reverse.png" x="640" y="1130" width="420" height="420"/>'
    B+=f'<image xlink:href="ss_badge_mono.png" x="180" y="1130" width="420" height="420"/>'
    B+=f'<rect x="180" y="1130" width="420" height="420" fill="none" stroke="#D3DAE1" stroke-width="2"/>'
    for x,t in ((1310,'צבע מלא: רקע לבן, דיגיטל והדפסה'),(850,'הפוך: רקע כהה, אתר, מצגות, רכבים'),(390,'חד-צבעי: חותמות, חריטה, הדפסה זולה')):
        B+=f'<text x="{x}" y="1585" text-anchor="middle" font-family="Heebo" font-weight="500" font-size="22" fill="#3C4650">{t}</text>'
    B+=f'<image xlink:href="ss_lockup_color.png" x="80" y="1620" width="1440" height="480"/>'
    B+=f'<text x="800" y="2120" text-anchor="middle" font-family="Heebo" font-weight="500" font-size="22" fill="#3C4650">פריסה רוחבית: נייר מכתבים, כותרת אתר, חתימת מייל, הצעות מחיר</text>'
    B+=h(2200,'5. צבעים')
    sw=[(NAVY,'כחול-לילה 0F1C24','רקע, טקסט'),(SNL,'תכלת SNL 1AA7DE','קווים, מסגרות'),(SUND,'כתום שמש F57C00','הדגשות, קו מפריד'),(LEAF,'ירוק עלה 7CB92B','אנרגיה נקייה'),('#E03131','אדום מצפן E03131','צפון, אקצנט'),('#F7941D','כתום מצפן F7941D','מזרח'),('#2F62E6','כחול מצפן 2F62E6','דרום'),('#17A85F','ירוק מצפן 17A85F','מערב')]
    for i,(c,n,u) in enumerate(sw):
        x=1520-i*185
        B+=f'<rect x="{x-150}" y="2230" width="150" height="80" rx="10" fill="{c}"/>'
        B+=f'<text x="{x-75}" y="2340" text-anchor="middle" font-family="Heebo" font-weight="600" font-size="18" fill="{NAVY}">{n}</text>'
        B+=f'<text x="{x-75}" y="2366" text-anchor="middle" font-family="Heebo" font-weight="400" font-size="17" fill="#5B6B7A">{u}</text>'
    B+=p(2420,'גופן: Heebo (Google Fonts, חינמי, עברית ואנגלית). שם המותג ב-Black 900 עם ריווח אותיות; טקסט רץ ב-Regular 400.',22,'#5B6B7A')
    return page(W,H,B)
open('ss_sheet.html','w',encoding='utf-8').write(sheet())
