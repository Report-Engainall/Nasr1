import { Link } from 'react-router-dom'
import { Package, ShoppingCart, Heart, GitCompare, Sparkles, MapPin, Phone, Mail, Shield, Truck, Award, Headphones } from 'lucide-react'
import { useSettings } from '../../lib/useSettings'

export default function StoreFooter() {
  const { settings } = useSettings()
  const storeName = settings['store_name'] || 'متجر الأغبري'
  const year = new Date().getFullYear()

  const trustFeatures = [
    { icon: Shield, title: 'دفع آمن', desc: 'حماية كاملة للمعاملات' },
    { icon: Truck, title: 'توصيل سريع', desc: 'شحن لجميع المناطق' },
    { icon: Award, title: 'جودة مضمونة', desc: 'منتجات أصلية 100%' },
    { icon: Headphones, title: 'دعم متواصل', desc: 'خدمة العملاء 24/7' },
  ]

  return (
    <footer className="sf-footer-premium">
      {/* Trust Bar */}
      <div className="sf-footer-trust-bar">
        {trustFeatures.map((f, i) => (
          <div key={i} className="sf-trust-item">
            <div className="sf-trust-icon"><f.icon size={22} /></div>
            <div><strong>{f.title}</strong><span>{f.desc}</span></div>
          </div>
        ))}
      </div>

      {/* Main Footer Content */}
      <div className="sf-footer-main">
        <div className="sf-footer-col sf-footer-brand-col">
          <div className="sf-footer-brand">
            <div className="sf-footer-brand-icon">أ</div>
            <div>
              <strong>{storeName}</strong>
              <span>Aghbari Commerce</span>
            </div>
          </div>
          <p className="sf-footer-desc">
            منصة تجارية متكاملة تخدم التجار والعملاء بأحدث التقنيات، أسعار تنافسية، وجودة عالية. نسعى لتوفير تجربة تسوق سلسة وذكية.
          </p>
          <div className="sf-footer-contact">
            <div className="sf-footer-contact-item"><MapPin size={16} /> <span>اليمن — صنعاء</span></div>
            <div className="sf-footer-contact-item"><Phone size={16} /> <span>+967 1 234 567</span></div>
            <div className="sf-footer-contact-item"><Mail size={16} /> <span>info@aghbari.com</span></div>
          </div>
        </div>

        <div className="sf-footer-col">
          <h4>روابط سريعة</h4>
          <ul>
            <li><Link to="/products"><Package size={14} /> المنتجات</Link></li>
            <li><Link to="/orders"><ShoppingCart size={14} /> طلباتي</Link></li>
            <li><Link to="/wishlist"><Heart size={14} /> المفضلة</Link></li>
            <li><Link to="/compare"><GitCompare size={14} /> مقارنة المنتجات</Link></li>
          </ul>
        </div>

        <div className="sf-footer-col">
          <h4>خدمات ذكية</h4>
          <ul>
            <li><Link to="/assistant"><Sparkles size={14} /> المساعد الذكي للتجارة</Link></li>
            <li><Link to="/products">تصفح حسب الفئة</Link></li>
            <li><Link to="/products">العروض والخصومات</Link></li>
            <li><Link to="/products">المنتجات المميزة</Link></li>
          </ul>
        </div>

        <div className="sf-footer-col">
          <h4>عن المتجر</h4>
          <ul>
            <li><a href="#">سياسة الاستخدام</a></li>
            <li><a href="#">الشروط والأحكام</a></li>
            <li><a href="#">سياسة الإرجاع</a></li>
            <li><a href="#">الأسئلة الشائعة</a></li>
          </ul>
        </div>
      </div>

      {/* Copyright Bar */}
      <div className="sf-footer-bottom">
        <div className="sf-footer-bottom-inner">
          <span>© {year} {storeName} — جميع الحقوق محفوظة</span>
          <span className="sf-footer-powered">Aghbari Commerce Platform v2.0</span>
        </div>
      </div>
    </footer>
  )
}
