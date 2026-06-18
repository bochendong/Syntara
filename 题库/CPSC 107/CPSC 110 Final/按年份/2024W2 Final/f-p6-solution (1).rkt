;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p6) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line

;;
;; Consider the following data definition for a graph, which is QUITE SIMILAR
;; to one you saw earlier this term.  Note that the sample graph, shown in
;; f-p6-figure.pdf is different than what you saw previously.
;;

;; =================
;; Data Definitions: 

(@htdd Node)
(define-struct node (number nexts))
;; Node is (make-node Integer (listof Integer))
;; interp. node's number, and list of numbers of nodes that the arrows point to

(define N101 (make-node 101 (list 102 107 108)))


#|
 A Map is AN OPAQUE DATA STRUCTURE that represents one or more distinct graphs.
 OPAQUE means you can't look inside it.  THE ONLY THING YOU ARE  ALLOWED TO DO
 WITH A MAP IS PASS IT TO generate-node.

 generate-node is defined at the bottom of the file. You should treat it as a
 primitive function described as follows:

(@htdf generate-node)
(@signature Map Integer -> Node)

 If a node with the given number exists in map then produce it.
 Signal an error if no node with the given number exists in the map.

 The bottom of the file defines a map called MAP for the graphs shown in
 this figure:

   https://cs110.students.cs.ubc.ca/exams/2024w2-f/f-p6-figure.pdf
 
 But the functions you design must work for any map and you should expect
 that the grader will call your functions with different maps.
|#

;;
;; Here is a natural recursion template.
;;

(@template-origin encapsulated Node (listof Integer) genrec)
#;
(define (fn-for-graph/nr start map)
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))
          
          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]
    
    (fn-for-? ...start)))


(@htdf find-psf-exceeding-path)
(@signature Map Integer Integer Integer -> (listof Integer) or false)
;; find first path from start to end where each num is > than path total so far
(check-expect (find-psf-exceeding-path 4  4 MAP) (list 4))
(check-expect (find-psf-exceeding-path 4  2 MAP) false)
(check-expect (find-psf-exceeding-path 2  3 MAP) (list 2 3))
(check-expect (find-psf-exceeding-path 2  1 MAP) false)
(check-expect (find-psf-exceeding-path 2  7 MAP) (list 2 7))
(check-expect (find-psf-exceeding-path 2 10 MAP) (list 2 7 10))
(check-expect (find-psf-exceeding-path 4  5 MAP) (list 4 5))
(check-expect (find-psf-exceeding-path 4  8 MAP) false)

(check-expect (find-psf-exceeding-path 11  66 MAP) false)
(check-expect (find-psf-exceeding-path 11  82 MAP) (list 11 20 35 82))
(check-expect (find-psf-exceeding-path 11 300 MAP) (list 11 20 35 82 300))
(check-expect (find-psf-exceeding-path 11 200 MAP) (list 11 20 35 82 200))

(@template-origin genrec Node (listof Integer) accumulator try-catch)

(define (find-psf-exceeding-path start end the-map)
  ;; path  is (listof Integer); node-numbers on path in reverse order
  ;; total is Integer; sum of path  
  (local [(define (fn-for-node n path total)
            (cond [(member (node-number n) path)   false] ;cycle
                  [(not (> (node-number n) total)) false] ;< total
                  [(= (node-number n) end)
                   (reverse (cons (node-number n) path))]
                  [else
                   (fn-for-lonn (node-nexts n)
                                (cons (node-number n) path)
                                (+    (node-number n) total))]))

          (define (fn-for-lonn lonn path total)
            (cond [(empty? lonn) false]
                  [else
                   (local [(define try
                             (fn-for-node (generate-node the-map (first lonn))
                                          path
                                          total))]
                     (if (not (false? try))
                         try
                         (fn-for-lonn (rest lonn) path total)))]))]

    (fn-for-node (generate-node the-map start) empty 0)))


(@htdf find-psf-exceeding-visited)
(@signature Map Integer Integer Integer -> (listof Integer) or false)
;; find 1st visited from start to end where each num is > than path total so far
(check-expect (find-psf-exceeding-visited 4  4 MAP) (list 4))
(check-expect (find-psf-exceeding-visited 4  2 MAP) false)
(check-expect (find-psf-exceeding-visited 2  3 MAP) (list 2 3))
(check-expect (find-psf-exceeding-visited 2  1 MAP) false)
(check-expect (find-psf-exceeding-visited 2  7 MAP) (list 2 3 7))
(check-expect (find-psf-exceeding-visited 2 10 MAP) (list 2 3 7 10))
(check-expect (find-psf-exceeding-visited 4  5 MAP) (list 4 5))
(check-expect (find-psf-exceeding-visited 4  8 MAP) false)

(check-expect (find-psf-exceeding-visited 11  66 MAP) false)
(check-expect (find-psf-exceeding-visited 11  82 MAP) (list 11 25 20 35 71 82))
(check-expect (find-psf-exceeding-visited 11 300 MAP)
              (list 11 25 20 35 71 82 300))
(check-expect (find-psf-exceeding-visited 11 200 MAP)
              (list 11 25 20 35 71 82 300 200))


(@template-origin genrec Node (listof Integer) accumulator)

;(define (find-psf-exceeding-visited start end the-map) false)

(define (find-psf-exceeding-visited start end the-map)
  ;; nn-wl   is (listof Integer); node number worklist
  ;; path-wl is (listof (listof Integer)); path worklist
  ;; visited is (listof Integer); node numbers visited so far (reverse order)
  ;;
  ;; path    is (listof Integer); node-numbers on path in reverse order
  (local [(define (fn-for-node n path nn-wl path-wl visited)
            (cond [(or (member (node-number n) path)
                       (not (> (node-number n) (foldr + 0 path))))
                   (fn-for-lonn nn-wl path-wl visited)]
                  [(= (node-number n) end)
                   (reverse (cons (node-number n) visited))]
                  [else
                   (fn-for-lonn (append (node-nexts n) nn-wl)
                                (append (make-list (length (node-nexts n))
                                                   (cons (node-number n) path))
                                        path-wl)
                                (cons (node-number n) visited))]))

          (define (fn-for-lonn nn-wl path-wl visited)
            (cond [(empty? nn-wl) false]
                  [else
                   (fn-for-node (generate-node the-map (first nn-wl))
                                (first path-wl)
                                (rest nn-wl)
                                (rest path-wl)
                                visited)]))]

    (fn-for-node (generate-node the-map start) empty empty empty empty)))






;;
;; <<< DO NOT EDIT ANYTHING BELOW THIS LINE >>>
;;

(@htdd Map)
;; Map is OPAQUE structure described above.
;;
;; generate-node is a primitive described-above.
;;

(@htdf generate-node)
(@signature Map Integer -> Node)
;; Give map and node number (name), generate corresponding node
(define (generate-node map number)
  (local [(define entry (assoc number (unbox map)))]
    (if (false? entry)
        (error "Node with given number does not exist." number)
        (apply make-node entry))))





(define MAP
  (box '((4 (2 5))
         
         (2 (3 7))
         (5 (8))
         
         (3 (1))
         (7 (10))
         (8 ())
         
         (1 ())
         (10 ())

         
         (11  (25 20 -2000))
         
         (25  (35))
         (20  (35))
         (-2000  (200 3))

         (35  (71 82))
         (200 ())
         (3   ())
         
         (71  ())
         (82  (300 200))
         (300 ())

         )))
