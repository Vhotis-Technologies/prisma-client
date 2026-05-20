/**
 * Vehicles list hook: fetches user vehicles and branch grouping via garageApi.
 */
import { useMemo } from "react";
import { useGetMyVehiclesQuery } from "../store/api/garageApi";
import { MyVehiclesProps, BranchVehiclesGroup } from "../interfaces/GarageInterface";

/**
 * Vehicles list hook with fleet branch flattening when applicable.
 *
 * @returns Flat vehicle list, loading/error states, and refetch
 */
const useVehicles = () => {
  const {
    data: vehiclesData,
    isLoading,
    error,
    refetch,
  } = useGetMyVehiclesQuery();

  // Transform vehicles data based on response structure
  // For fleet owners: extract vehicles from branches
  // For regular users/branch admins: use array as-is
  const vehicles: MyVehiclesProps[] = useMemo(() => {
    if (!vehiclesData) return [];
    
    // If it's an array, return as-is
    if (Array.isArray(vehiclesData)) {
      return vehiclesData;
    }
    
    // If it has branches (fleet owner), flatten the vehicles from all branches
    if ("branches" in vehiclesData && Array.isArray(vehiclesData.branches)) {
      return vehiclesData.branches.flatMap((branch: BranchVehiclesGroup) => branch.vehicles || []);
    }
    
    return [];
  }, [vehiclesData]);

  return {
    vehicles,
    isLoading,
    error,
    refetch,
  };
};

export default useVehicles;
