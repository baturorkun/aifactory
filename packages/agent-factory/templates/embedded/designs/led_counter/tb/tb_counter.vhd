-- Self-checking testbench of counter: reset, counting, hold without enable,
-- wrap-around. Prints TEST PASSED when every check held; a failed check stops
-- the simulation with severity failure.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_counter is
end entity;

architecture sim of tb_counter is
    constant WIDTH  : positive := 4;
    constant PERIOD : time := 10 ns;

    signal clk   : std_logic := '0';
    signal rst   : std_logic := '1';
    signal en    : std_logic := '0';
    signal count : std_logic_vector(WIDTH - 1 downto 0);
    signal done  : boolean := false;

    procedure expect(actual : std_logic_vector; value : natural; what : string) is
    begin
        assert unsigned(actual) = value
            report what & ": expected " & integer'image(value) & ", got " & integer'image(to_integer(unsigned(actual)))
            severity failure;
    end procedure;
begin
    clk <= not clk after PERIOD / 2 when not done;

    dut : entity work.counter
        generic map (G_WIDTH => WIDTH)
        port map (clk => clk, rst => rst, en => en, count => count);

    stimulus : process
    begin
        wait until rising_edge(clk);
        wait until rising_edge(clk);
        wait for 1 ns;
        expect(count, 0, "reset");

        rst <= '0';
        en  <= '1';
        for i in 1 to 5 loop
            wait until rising_edge(clk);
            wait for 1 ns;
            expect(count, i, "count");
        end loop;

        en <= '0';
        wait until rising_edge(clk);
        wait for 1 ns;
        expect(count, 5, "hold without enable");

        en <= '1';
        for i in 6 to 2 ** WIDTH loop
            wait until rising_edge(clk);
        end loop;
        wait for 1 ns;
        expect(count, 0, "wrap-around");

        report "TEST PASSED";
        done <= true;
        wait;
    end process;
end architecture;
