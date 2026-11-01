import InnerFooter from "../components/InnerFooter";
import credits from "./credits.json";

export const metadata = { title: "Créditos de imágenes | Grúas Cares" };

export default function CreditosPage() {
  return (
    <>
      <main className="inner-page">
        <section className="page-intro wrap">
          <div>
            <p className="eyebrow">Tienda</p>
            <h1>Créditos de <em>imágenes.</em></h1>
          </div>
          <p>Las fotos de referencia de los productos provienen de Wikimedia Commons y se usan según sus licencias libres. Son imágenes ilustrativas, no del stock real.</p>
        </section>
        <section className="wrap" style={{ paddingBottom: 90 }}>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Producto</th><th>Autor</th><th>Licencia</th><th>Origen</th></tr></thead>
              <tbody>
                {credits.map((item) => (
                  <tr key={item.product}>
                    <td><strong>{item.product}</strong></td>
                    <td>{item.author}</td>
                    <td>{item.license}</td>
                    <td><a href={item.url} target="_blank" rel="noreferrer noopener">{item.file}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <InnerFooter />
    </>
  );
}
