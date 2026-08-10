import io
p='src/pages/app/index.astro'
s=io.open(p,encoding='utf-8').read()
a = '\togImage="/images/creattia/avatar-nobg.webp"'
b = """\t{/* La misma tarjeta que la home, y por el mismo motivo. Acá apuntaba al avatar
\t    en WebP: Facebook y WhatsApp no leen WebP para la vista previa, y encima es
\t    cuadrado de 500px mientras las etiquetas declaran 1200x630. Con las dos
\t    cosas juntas, compartir el link de la app no mostraba ninguna imagen. */}
\togImage="/images/creattia/og-image.png\""""
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
print('app arreglado')
