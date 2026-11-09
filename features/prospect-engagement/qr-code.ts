import QRCode from 'qrcode'

export async function qrSvg(url: string) {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#102746', light: '#FFFFFFFF' },
  })
}

export async function qrPng(url: string, width = 1600) {
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width,
    color: { dark: '#102746', light: '#FFFFFFFF' },
  })
}
