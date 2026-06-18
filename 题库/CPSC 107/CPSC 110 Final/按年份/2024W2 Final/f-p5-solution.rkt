;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p5) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line

(@htdd Square Jump)

(define-struct square (num ladder))
(define-struct jump (to))

;; Square is (make-square Natural Jump)
;; Jump is (make-jump Natural)
;;
;; interp.
;;  A GRAPH of squares connected by the next-square generative
;;  step described below. Squares also have jumps.
;;
;;   - A square has a number, these are the naturals 0, 1, ...
;;
;;   - Each square has a next square that is either:
;;      the square with the next square number, or
;;      the first square if there are no more squares in the map.
;;
;;   - A jump that goes to a square that is not restricted to
;;     being the next square.
;;

(@htdd Map)
;; Map is ???
;; interp. an opaque data type that represents a map from node names to nodes.
;;         Only the provided function next-square knows how to work with a map.
;;
;; CONSTRAINT: A given map has no duplicate square numbers, and every Jump
;;             in a map goes to a square number that exists in the map.
;;
;; We are giving you one map to work with called MAP, and the attached file
;; f-p5-figure.pdf includes a diagram of the graph represented by that map.
;; Do not assume that we will only test your function with that map.


;;
;; Here is a STRUCTURALLY RECURSIVE template for working with a graph of these
;; nodes.
;;


(@template-origin genrec encapsulated Square Jump)
#;
(define (fn-for-graph map)
  (local [(define (fn-for-square s)
            (if (trivial? ...)
                (trivial-answer ...)
                (... (square-num s)
                     (fn-for-square (next-square s map)) ;generative step
                     (fn-for-jump (square-ladder s)))))

          (define (fn-for-jump j)
            (... (jump-to j)))]

    (fn-for-square (first map))))


(@htdf do-roll)
(@signature Natural Natural Map -> Natural)
;; produce key of destination square after moving n squares and taking jump
(check-expect (do-roll 1 MAP) 2)
(check-expect (do-roll 2 MAP) 3)
(check-expect (do-roll 5 MAP) 2)
(check-expect (do-roll 6 MAP) 10)
(check-expect (do-roll 8 MAP) 15)
(check-expect (do-roll 28 MAP) 13)

;(define (do-roll roll map) 0) ;stub

(@template-origin genrec encapsulated Square Jump accumulator)

(define (do-roll roll map)
  ;; n-left is Natural; number of times still to call next-square
  (local [(define (fn-for-square s n-left)
            (if (zero? n-left)
                (fn-for-jump (square-ladder s))
                (fn-for-square (next-square s map)
                               (sub1 n-left))))

          (define (fn-for-jump j)
            (jump-to j))]

    (fn-for-square (first map) roll)))


;;
;; *** There is no need to read beyond this point in the file. ***
;;

(define MAP
  (list (make-square 0  (make-jump 6))
        (make-square 1  (make-jump 2))
        (make-square 2  (make-jump 3))
        (make-square 3  (make-jump 4))
        (make-square 4  (make-jump 10))
        (make-square 5  (make-jump 2))
        (make-square 6  (make-jump 10))
        (make-square 7  (make-jump 0))
        (make-square 8  (make-jump 15))
        (make-square 9  (make-jump 6))
        (make-square 10 (make-jump 11))
        (make-square 11 (make-jump 4))
        (make-square 12 (make-jump 13))
        (make-square 13 (make-jump 10))
        (make-square 14 (make-jump 9))
        (make-square 15 (make-jump 14))))

(@htdf next-square)
(@signature Square Map -> Square)
;; Given map and square, generate corresponding square
(define (next-square sqr the-map)
  (if (not (map? the-map))
      (error 'next-square "Second argument to generate-square is not a map.")
      (local [(define next-n (add1 (square-num sqr)))]
        (cond [(>= next-n (length the-map)) (first the-map)]
              [else (list-ref the-map next-n)]))))

(define (map? x)
  (and (list? x)
       (andmap square? x)))
