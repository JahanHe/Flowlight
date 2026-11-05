// Selected calendar content: verified 2026 dates, not an exhaustive world calendar or a leave/shift schedule.
// Solar-term dates are civil dates in UTC+08:00, checked against the Hong Kong Observatory 2026 table.
// Ancient poem excerpts use modern simplified characters and punctuation; no modern translations included.
window.calendarDemoData = {
  year: 2026,
  scope: '2026 年内容：二十四节气、部分中国节日与国际纪念日、10 条古典诗词。不含放假调休。',
  terms: [
    {date:'2026-01-05',name:'小寒'}, {date:'2026-01-20',name:'大寒'},
    {date:'2026-02-04',name:'立春'}, {date:'2026-02-18',name:'雨水'},
    {date:'2026-03-05',name:'惊蛰'}, {date:'2026-03-20',name:'春分'},
    {date:'2026-04-05',name:'清明'}, {date:'2026-04-20',name:'谷雨'},
    {date:'2026-05-05',name:'立夏'}, {date:'2026-05-21',name:'小满'},
    {date:'2026-06-05',name:'芒种'}, {date:'2026-06-21',name:'夏至'},
    {date:'2026-07-07',name:'小暑'}, {date:'2026-07-23',name:'大暑'},
    {date:'2026-08-07',name:'立秋'}, {date:'2026-08-23',name:'处暑'},
    {date:'2026-09-07',name:'白露'}, {date:'2026-09-23',name:'秋分'},
    {date:'2026-10-08',name:'寒露'}, {date:'2026-10-23',name:'霜降'},
    {date:'2026-11-07',name:'立冬'}, {date:'2026-11-22',name:'小雪'},
    {date:'2026-12-07',name:'大雪'}, {date:'2026-12-22',name:'冬至'}
  ],
  events: [
    {date:'2026-01-01',name:'元旦',type:'china',description:'公历新年的第一天。',sourceUrl:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'},
    {date:'2026-01-26',name:'腊八节',type:'traditional',description:'农历腊月初八，年味渐近。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-02-16',name:'除夕',type:'traditional',description:'农历旧年的最后一天；今年为腊月廿九。',sourceUrl:'https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2026.csv'},
    {date:'2026-02-17',name:'春节',type:'traditional',description:'农历正月初一，丙午马年的开始。',sourceUrl:'https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2026.csv'},
    {date:'2026-03-03',name:'元宵节',type:'traditional',description:'农历正月十五，赏灯与团圆的日子。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-03-08',name:'国际妇女节',type:'world',description:'关注妇女权益与性别平等的国际纪念日。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-03-20',name:'龙抬头',type:'traditional',description:'农历二月初二；今年与春分同日。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-03-22',name:'世界水日',type:'world',description:'关注淡水资源与人人获得清洁用水。',sourceUrl:'https://www.unesco.org/zh/days/world-water'},
    {date:'2026-04-05',name:'清明节',type:'traditional',description:'慎终追远、踏青迎春的传统节日。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-04-22',name:'世界地球日',type:'world',description:'联合国正式名称为国际地球母亲日，关注人与自然的共同家园。',sourceUrl:'https://www.un.org/zh/observances/earth-day/background'},
    {date:'2026-04-23',name:'世界读书日',type:'world',description:'世界图书和版权日，邀请人们走近书籍与阅读。',sourceUrl:'https://www.unesco.org/zh/days/world-book-and-copyright'},
    {date:'2026-05-01',name:'劳动节',type:'china',description:'向每一份劳动致意。节日日期不代表本日历提供调休安排。',sourceUrl:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'},
    {date:'2026-05-04',name:'青年节',type:'china',description:'中国青年节，纪念五四运动。',sourceUrl:'https://rsj.gz.gov.cn/zcfg/flfg/content/post_10803356.html'},
    {date:'2026-06-01',name:'儿童节',type:'china',description:'国内通行的六一儿童节，与十一月的世界儿童日分别列出。',sourceUrl:'https://rsj.gz.gov.cn/zcfg/flfg/content/post_10803356.html'},
    {date:'2026-06-05',name:'世界环境日',type:'world',description:'关注生态环境，让保护自然成为日常行动。',sourceUrl:'https://www.un.org/zh/observances/environment-day'},
    {date:'2026-06-08',name:'世界海洋日',type:'world',description:'关注海洋及其与人类生活的联系。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-06-19',name:'端午节',type:'traditional',description:'农历五月初五，粽香与龙舟相伴的节日。',sourceUrl:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'},
    {date:'2026-08-19',name:'七夕',type:'traditional',description:'农历七月初七，传统乞巧之日。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-09-21',name:'国际和平日',type:'world',description:'纪念和平，倡导非暴力。',sourceUrl:'https://www.unesco.org/zh/days/peace'},
    {date:'2026-09-25',name:'中秋节',type:'traditional',description:'农历八月十五，赏月、团圆与思念。',sourceUrl:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'},
    {date:'2026-10-01',name:'国庆节',type:'china',description:'中华人民共和国国庆日。',sourceUrl:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'},
    {date:'2026-10-18',name:'重阳节',type:'traditional',description:'农历九月初九，登高赏秋、敬老思亲。',sourceUrl:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {date:'2026-11-05',name:'世界海啸意识日',type:'world',description:'认识海啸风险，关注防灾与韧性。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-11-10',name:'世界科学日',type:'world',description:'争取和平与发展世界科学日，关注科学与社会。',sourceUrl:'https://www.unesco.org/en/days'},
    {date:'2026-11-14',name:'世界糖尿病日',type:'world',description:'提高对糖尿病的认识与关注。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-11-16',name:'国际宽容日',type:'world',description:'尊重差异，理解多元文化。',sourceUrl:'https://www.unesco.org/en/days'},
    {date:'2026-11-20',name:'世界儿童日',type:'world',description:'关注每个儿童的权利、福祉与未来。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-11-21',name:'世界电视日',type:'world',description:'关注电视传播与信息交流的作用。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'},
    {date:'2026-11-25',name:'国际消除对妇女暴力日',type:'world',description:'联合国纪念日：制止暴力侵害妇女行为国际日。',sourceUrl:'https://www.un.org/zh/observances/list-days-weeks'}
  ],
  quotes: [
    {text:'行到水穷处，坐看云起时。',author:'王维',source:'终南别业',category:'诗词',sourceUrl:'https://www.gushiwen.cn/shiwenv_cd7027786b98.aspx'},
    {text:'明月松间照，清泉石上流。',author:'王维',source:'山居秋暝',category:'诗词',sourceUrl:'https://zh.wikisource.org/wiki/山居秋暝'},
    {text:'海上生明月，天涯共此时。',author:'张九龄',source:'望月怀远',category:'诗词',sourceUrl:'https://zh.wikisource.org/zh/望月懷遠'},
    {text:'莫听穿林打叶声，何妨吟啸且徐行。',author:'苏轼',source:'定风波·莫听穿林打叶声',category:'诗词',sourceUrl:'https://zh.wikisource.org/zh-hant/定風波_(莫聽穿林打葉聲)'},
    {text:'采菊东篱下，悠然见南山。',author:'陶渊明',source:'饮酒·其五',category:'诗词',sourceUrl:'https://www.shidianguji.com/zh/book/SBCK117/chapter/SBCK117_51'},
    {text:'半亩方塘一鉴开，天光云影共徘徊。',author:'朱熹',source:'观书有感·其一',category:'诗词',sourceUrl:'https://zh.wikisource.org/zh-hant/觀書有感'},
    {text:'小荷才露尖尖角，早有蜻蜓立上头。',author:'杨万里',source:'小池',category:'诗词',sourceUrl:'https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/recommended-passages/KS1_18.pdf'},
    {text:'爆竹声中一岁除，春风送暖入屠苏。',author:'王安石',source:'元日',category:'诗词',sourceUrl:'https://www.rthk.hk/chiculture/chipoem/poem13.htm'},
    {text:'晚来天欲雪，能饮一杯无？',author:'白居易',source:'问刘十九',category:'诗词',sourceUrl:'https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/jilei_shi_055.pdf'},
    {text:'但愿人长久，千里共婵娟。',author:'苏轼',source:'水调歌头·明月几时有',category:'诗词',sourceUrl:'https://zh.wikisource.org/zh-hant/水調歌頭_(明月幾時有)'}
  ],
  sources: [
    {name:'香港天文台 · 2026 公历农历与节气对照',url:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf'},
    {name:'香港天文台 · 2026 农历逐日数据',url:'https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2026.csv'},
    {name:'联合国 · 国际日和国际周',url:'https://www.un.org/zh/observances/list-days-weeks'},
    {name:'联合国教科文组织 · 国际日',url:'https://www.unesco.org/en/days'},
    {name:'中国政府网 · 2026 节假日通知（仅核验节日，未接入调休）',url:'https://www.gov.cn/zhengce/content/202511/content_7047090.htm'}
  ]
};
