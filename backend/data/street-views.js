/* Các góc xem 360° (Google Street View) tại những danh thắng nổi tiếng của từng địa điểm.
   Mỗi dòng: [tên góc nhìn, vĩ độ chỗ đứng, kinh độ chỗ đứng, vĩ độ địa danh, kinh độ địa danh, góc ngước]
   - Hướng nhìn được tính tự động từ chỗ đứng → địa danh, nên mở lên là thấy địa danh ở giữa.
   - Không có tọa độ địa danh (null) thì dùng số cuối cùng làm hướng nhìn (0 = Bắc, 90 = Đông...).
   - Tọa độ là điểm gần đúng: trang web tự tìm ảnh 360° gần nhất quanh đó. */

const SPOTS = {
    "Hà Nội": [
        ["Hồ Hoàn Kiếm – Tháp Rùa", 21.0299, 105.8528, 21.0279, 105.8522, 0],
        ["Phố cổ Tạ Hiện", 21.0353, 105.8517, null, null, 0, 180],
        ["Quảng trường Ba Đình – Lăng Bác", 21.0369, 105.8364, 21.0367, 105.8346, 0],
        ["Chùa Một Cột", 21.0357, 105.8339, 21.0359, 105.8336, 5],
        ["Văn Miếu – Quốc Tử Giám", 21.0268, 105.8357, 21.0275, 105.8356, 5],
        ["Chợ Đồng Xuân", 21.0377, 105.8495, 21.0383, 105.8498, 5]
    ],
    "Tokyo": [
        ["Giao lộ Shibuya", 35.6590, 139.7006, 35.6595, 139.7004, 0],
        ["Đền Senso-ji – Cổng Kaminarimon", 35.7106, 139.7963, 35.7111, 139.7963, 5],
        ["Phố Nakamise – Chính điện Senso-ji", 35.7130, 139.7965, 35.7148, 139.7967, 5],
        ["Tokyo Skytree", 35.7080, 139.8095, 35.7101, 139.8107, 30],
        ["Công viên Ueno – Hồ Shinobazu", 35.7128, 139.7716, 35.7110, 139.7703, 0],
        ["Chợ cá Tsukiji", 35.6652, 139.7704, null, null, 0, 90]
    ],
    "London": [
        ["Big Ben từ cầu Westminster", 51.5008, -0.1218, 51.5007, -0.1246, 10],
        ["London Eye từ bờ sông Thames", 51.5039, -0.1228, 51.5033, -0.1196, 5],
        ["Cung điện Buckingham", 51.5019, -0.1395, 51.5014, -0.1419, 0],
        ["Cầu Tháp London (Tower Bridge)", 51.5040, -0.0790, 51.5055, -0.0754, 5],
        ["Công viên Hyde Park – Hồ Serpentine", 51.5045, -0.1650, null, null, 0, 270]
    ],
    "Hàng Châu": [
        ["Tây Hồ – Đê Bạch", 30.2600, 120.1500, 30.2555, 120.1425, 0],
        ["Tháp Lôi Phong", 30.2340, 120.1490, 30.2312, 120.1490, 10],
        ["Làng trà Long Tỉnh", 30.2290, 120.1170, null, null, 0, 180],
        ["Ô trấn (Tây Sách)", 30.7440, 120.4890, null, null, 0, 90]
    ],
    "Thụy Sĩ": [
        ["Thung lũng Lauterbrunnen – Thác Staubbach", 46.5935, 7.9085, 46.5966, 7.9069, 15],
        ["Lucerne – Cầu Chapel", 47.0510, 8.3085, 47.0518, 8.3070, 0],
        ["Bern – Tháp đồng hồ Zytglogge", 46.9479, 7.4460, 46.9480, 7.4478, 10],
        ["Geneva – Đài phun nước Jet d'Eau", 46.2065, 6.1480, 46.2074, 6.1557, 10],
        ["Interlaken – Bãi cỏ Höhematte", 46.6863, 7.8584, 46.5370, 7.9620, 5]
    ],
    "Paris": [
        ["Tháp Eiffel từ quảng trường Trocadéro", 48.8616, 2.2888, 48.8584, 2.2945, 10],
        ["Bảo tàng Louvre – Kim tự tháp kính", 48.8613, 2.3365, 48.8610, 2.3358, 5],
        ["Nhà thờ Đức Bà Paris", 48.8534, 2.3470, 48.8530, 2.3499, 15],
        ["Cung điện Versailles", 48.8049, 2.1230, 48.8049, 2.1204, 5],
        ["Lyon – Vương cung Thánh đường Fourvière", 45.7622, 4.8215, 45.7600, 4.8400, 0]
    ],
    "Ai Cập": [
        ["Kim tự tháp Giza", 29.9717, 31.1286, 29.9792, 31.1342, 5],
        ["Tượng Nhân Sư Giza", 29.9746, 31.1385, 29.9753, 31.1376, 5],
        ["Sông Nile – Cầu Qasr El Nil", 30.0436, 31.2297, null, null, 0, 180],
        ["Thung lũng các vị Vua", 25.7400, 32.6020, null, null, 0, 270]
    ],
    "Bắc Cực": [
        ["Tromsø – Nhà thờ Bắc Cực", 69.6480, 18.9670, 69.6481, 18.9873, 5],
        ["Lapland – Làng Ông già Noel (Rovaniemi)", 66.5436, 25.8473, null, null, 0, 0],
        ["Svalbard – Longyearbyen", 78.2232, 15.6267, null, null, 0, 0],
        ["Greenland – Vịnh băng Ilulissat", 69.2167, -51.0990, null, null, 0, 270]
    ],
    "Bangkok": [
        ["Cung điện Hoàng gia Grand Palace", 13.7500, 100.4925, 13.7500, 100.4913, 10],
        ["Chùa Phật Ngọc Wat Phra Kaew", 13.7525, 100.4930, 13.7516, 100.4927, 10],
        ["Chùa Bình Minh Wat Arun từ bến Tha Tien", 13.7460, 100.4920, 13.7437, 100.4888, 10],
        ["Trung tâm ICONSIAM bên sông Chao Phraya", 13.7270, 100.5085, 13.7267, 100.5106, 5]
    ],
    "Canada": [
        ["Hồ Moraine – Công viên quốc gia Banff", 51.3217, -116.1860, 51.3226, -116.1810, 0],
        ["Hồ Louise – Banff", 51.4167, -116.2172, 51.4140, -116.2380, 0],
        ["Thác Niagara – Table Rock", 43.0791, -79.0786, 43.0779, -79.0753, 0],
        ["Vancouver – Canada Place", 49.2888, -123.1111, null, null, 0, 0],
        ["Québec – Lâu đài Frontenac", 46.8105, -71.2037, 46.8122, -71.2051, 10]
    ],
    "Đà Lạt": [
        ["Hồ Xuân Hương", 11.9420, 108.4386, 11.9430, 108.4420, 0],
        ["Quảng trường Lâm Viên", 11.9380, 108.4440, 11.9375, 108.4445, 5],
        ["Chợ đêm Đà Lạt", 11.9430, 108.4370, null, null, 0, 90],
        ["Thác Pongour", 11.6870, 108.2570, null, null, 0, 0],
        ["Hồ Tuyền Lâm", 11.8940, 108.4220, null, null, 0, 180]
    ],
    "Đà Nẵng": [
        ["Cầu Rồng bên sông Hàn", 16.0640, 108.2245, 16.0612, 108.2275, 5],
        ["Bãi biển Mỹ Khê", 16.0610, 108.2475, null, null, 0, 90],
        ["Bà Nà Hills – Cầu Vàng", 15.9952, 107.9966, null, null, 0, 270],
        ["Ngũ Hành Sơn", 16.0040, 108.2630, null, null, 0, 0]
    ],
    "Hà Giang": [
        ["Đèo Mã Pí Lèng", 23.2375, 105.4135, null, null, 0, 90],
        ["Sông Nho Quế", 23.2300, 105.4250, null, null, -10, 90],
        ["Cột cờ Lũng Cú", 23.3640, 105.3160, null, null, 15, 0],
        ["Phố cổ Đồng Văn", 23.2785, 105.3620, null, null, 0, 90]
    ],
    "Úc": [
        ["Nhà hát Opera Sydney", -33.8610, 151.2108, -33.8568, 151.2153, 5],
        ["Bãi biển Bondi", -33.8915, 151.2767, null, null, 0, 120],
        ["Melbourne – Ga Flinders Street", -37.8175, 144.9670, -37.8183, 144.9671, 10],
        ["Núi đá Uluru", -25.3270, 131.0130, -25.3444, 131.0369, 0]
    ],
    "Seoul": [
        ["Cung Gyeongbokgung – Cổng Gwanghwamun", 37.5740, 126.9768, 37.5759, 126.9768, 5],
        ["Làng Bukchon Hanok", 37.5826, 126.9850, null, null, 0, 180],
        ["Tháp N Seoul", 37.5530, 126.9870, 37.5512, 126.9882, 25],
        ["Phố mua sắm Myeongdong", 37.5636, 126.9850, null, null, 0, 0]
    ],
    "Berlin": [
        ["Cổng Brandenburg", 52.5163, 13.3790, 52.5163, 13.3777, 10],
        ["Tòa nhà Quốc hội Reichstag", 52.5185, 13.3740, 52.5186, 13.3762, 5],
        ["Quảng trường Alexanderplatz – Tháp truyền hình", 52.5219, 13.4132, 52.5208, 13.4094, 25],
        ["Đảo Bảo tàng – Bảo tàng Bode", 52.5225, 13.3965, 52.5219, 13.3947, 5]
    ],
    "Mỹ": [
        ["Quảng trường Times Square", 40.7580, -73.9855, 40.7590, -73.9845, 5],
        ["Tượng Nữ thần Tự do", 40.6895, -74.0450, 40.6892, -74.0445, 25],
        ["Công viên Trung tâm – Bethesda Terrace", 40.7740, -73.9711, null, null, 0, 0],
        ["Cầu Cổng Vàng từ Battery Spencer", 37.8325, -122.4835, 37.8199, -122.4783, 0],
        ["Grand Canyon – Mather Point", 36.0617, -112.1077, null, null, -5, 0]
    ],
    "Singapore": [
        ["Marina Bay Sands nhìn từ Esplanade", 1.2895, 103.8555, 1.2834, 103.8607, 5],
        ["Tượng Merlion", 1.2872, 103.8540, 1.2868, 103.8545, 5],
        ["Gardens by the Bay – Rừng Supertree", 1.2810, 103.8630, 1.2819, 103.8637, 20],
        ["Chùa Răng Phật", 1.2810, 103.8445, 1.2815, 103.8443, 10],
        ["Đảo Sentosa – Bãi biển Siloso", 1.2540, 103.8100, null, null, 0, 180]
    ],
    "Hong Kong": [
        ["Cảng Victoria từ Tiêm Sa Chủy", 22.2934, 114.1701, 22.2830, 114.1580, 0],
        ["Đỉnh Victoria Peak", 22.2711, 114.1497, 22.2850, 114.1600, -5],
        ["Đại Phật Thiên Đàn – Ngong Ping", 22.2560, 113.9055, 22.2540, 113.9050, 20],
        ["Hong Kong Disneyland", 22.3130, 114.0413, null, null, 0, 0]
    ],
    "Thượng Hải": [
        ["Bến Thượng Hải (The Bund)", 31.2401, 121.4905, 31.2397, 121.4998, 5],
        ["Phố Đông – Tháp Thượng Hải", 31.2380, 121.5000, 31.2335, 121.5056, 25],
        ["Dự Viên", 31.2272, 121.4920, null, null, 0, 0],
        ["Disneyland Thượng Hải", 31.1440, 121.6570, null, null, 0, 0]
    ]
};

/* Hướng (độ) từ điểm A tới điểm B trên mặt cầu */
function bearing(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad)
        - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return Math.round(((Math.atan2(y, x) / rad) + 360) % 360);
}

/* Danh sách góc nhìn đã sẵn sàng để lưu vào MongoDB */
function streetViewsFor(name) {
    return (SPOTS[name] || []).map(([label, lat, lng, tLat, tLng, pitch, heading = 0]) => ({
        name: label,
        lat,
        lng,
        heading: tLat != null ? bearing(lat, lng, tLat, tLng) : heading,
        pitch: pitch || 0,
        pano: ""
    }));
}

module.exports = { SPOTS, streetViewsFor, bearing };
