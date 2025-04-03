import {create} from "zustand";

export const useProductStore = create((set) => ({

    products: [],
    setProducts: (products) => set({ products }),

}))

//const [state, setState] = useState([])

