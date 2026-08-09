async function testPostReceipt() {
  try {
    console.log("Testing POST /api/receipts on port 3001...");
    const res = await fetch("http://localhost:3001/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantName: "PERKARA KOPI TEST",
        date: "2026-08-09",
        subtotal: 100000,
        taxAmount: 10857,
        totalAmount: 110857,
        paymentMethod: "Cash",
        paymentStatus: "Lunas",
        note: "Test simpan nota",
        items: [
          { name: "Kopi Kitta", category: "Bahan Baku", subCategory: "Minuman & Sirup", price: 50000, quantity: 2 }
        ]
      })
    });

    console.log("POST Response Status:", res.status);
    const data = await res.json();
    console.log("POST Response Data:", data);
  } catch (err) {
    console.error("Test POST Error:", err.message);
  }
}

testPostReceipt();
